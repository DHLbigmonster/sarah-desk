import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import path from 'path';
import { cp, mkdir } from 'fs/promises';
import { execSync } from 'child_process';

// Native modules that need special handling for packaging
const nativeModules = [
  'uiohook-napi',
  '@xitanggg/node-insert-text',
  '@xitanggg/node-insert-text-darwin-arm64',
  '@xitanggg/node-insert-text-darwin-universal',
  // Dependencies
  'node-gyp-build',
  'ws',
];

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '*.{node,dll}',
    },
    name: 'Sarah',
    executableName: 'Sarah',
    appBundleId: 'com.sarah.app',
    icon: './assets/icon',
    // Bundle the tray icon next to the packaged app. main.ts reads it via
    // `process.resourcesPath/assets/tray-icon.png` when app.isPackaged is true.
    extraResource: ['./assets/tray-icon.png', './.env'],
  },
  rebuildConfig: {
    force: true,
  },
  hooks: {
    // Copy native modules after packaging
    packageAfterCopy: async (_forgeConfig, buildPath) => {
      const sourceNodeModulesPath = path.resolve(__dirname, 'node_modules');
      const destNodeModulesPath = path.resolve(buildPath, 'node_modules');

      await Promise.all(
        nativeModules.map(async (packageName) => {
          const sourcePath = path.join(sourceNodeModulesPath, packageName);
          const destPath = path.join(destNodeModulesPath, packageName);
          try {
            await mkdir(path.dirname(destPath), { recursive: true });
            await cp(sourcePath, destPath, {
              recursive: true,
              preserveTimestamps: true,
            });
          } catch (error) {
            // Module might not exist (platform-specific)
            console.warn(`Could not copy native module ${packageName}:`, error);
          }
        }),
      );
    },
    postPackage: async (_forgeConfig, options) => {
      if (process.platform === 'darwin') {
        const appPath = path.join(options.outputPaths[0], `${options.packagerConfig?.name ?? 'Sarah'}.app`);
        execSync(`xattr -cr "${appPath}"`);
        execSync(`codesign --force --deep --sign - "${appPath}"`);
        console.log('Re-signed app:', appPath);
      }
    },
  },
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
        {
          name: 'floating_window',
          config: 'vite.floating.config.ts',
        },
        {
          name: 'clawdesk_window',
          config: 'vite.clawdesk.config.ts',
        },
        {
          name: 'mini_settings_window',
          config: 'vite.mini-settings.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: false, // Required for native modules (.node files)
    }),
  ],
};

export default config;
