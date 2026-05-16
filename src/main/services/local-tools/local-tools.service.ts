import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import log from 'electron-log';
import type {
  LocalToolApprovalScope,
  LocalToolCapability,
  LocalToolExecutionRequest,
  LocalToolExecutionResult,
  LocalToolId,
  LocalToolsSnapshot,
  LocalToolStatus,
} from '../../../shared/types/local-tools';
import { approvalStore } from './approval-store';
import { executeCapability } from './executor';

const execFileAsync = promisify(execFile);
const logger = log.scope('local-tools');

const DEFAULT_OPENCLAW_PORT = 18789;
const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const HERMES_HOME = path.join(os.homedir(), '.hermes');
const HERMES_DESKTOP_SUPPORT = path.join(os.homedir(), 'Library', 'Application Support', 'HermesDesktop');
const HERMES_LAUNCH_AGENT = path.join(os.homedir(), 'Library', 'LaunchAgents', 'ai.hermes.gateway.plist');
const CODEX_HOME = path.join(os.homedir(), '.codex');
const CLAUDE_HOME = path.join(os.homedir(), '.claude');
const EXTRA_BIN_DIRS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/opt/node22/bin',
  `${os.homedir()}/.local/bin`,
  `${os.homedir()}/.volta/bin`,
  `${os.homedir()}/.bun/bin`,
];

interface GatewayConfig {
  configFound: boolean;
  tokenConfigured: boolean;
  port: number;
}

function checkedNow(): number {
  return Date.now();
}

function parseVersion(output: string): string | null {
  return output
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) ?? null;
}

async function run(binary: string, args: string[], timeout = 2500): Promise<{ stdout: string; stderr: string } | null> {
  try {
    const result = await execFileAsync(binary, args, {
      timeout,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: [...new Set([...(process.env.PATH ?? '').split(':').filter(Boolean), ...EXTRA_BIN_DIRS])].join(':'),
      },
    });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch {
    return null;
  }
}

async function resolveBinary(candidates: string[]): Promise<{ command: string; path: string } | null> {
  for (const command of candidates) {
    const which = await run('which', [command], 1500);
    const found = which?.stdout.trim();
    if (found) return { command, path: found };

    for (const dir of EXTRA_BIN_DIRS) {
      const candidatePath = path.join(dir, command);
      if (fs.existsSync(candidatePath)) return { command, path: candidatePath };
    }
  }
  return null;
}

async function resolveVersion(binaryPath: string, versionArgs: string[][]): Promise<string | null> {
  for (const args of versionArgs) {
    const result = await run(binaryPath, args, 2200);
    const version = result ? parseVersion(result.stdout) ?? parseVersion(result.stderr) : null;
    if (version) return version;
  }
  return null;
}

function readGatewayConfig(): GatewayConfig {
  try {
    const raw = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw) as { gateway?: { port?: number; auth?: { token?: string } } };
    const token = config.gateway?.auth?.token?.trim();
    return {
      configFound: true,
      tokenConfigured: Boolean(token),
      port: config.gateway?.port ?? DEFAULT_OPENCLAW_PORT,
    };
  } catch {
    return {
      configFound: false,
      tokenConfigured: false,
      port: DEFAULT_OPENCLAW_PORT,
    };
  }
}

function probePort(port: number, timeoutMs = 700): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const finish = (value: boolean): void => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, '127.0.0.1');
  });
}

function safeCapability(
  id: string,
  label: string,
  description: string,
  commandHint: string | null,
  enabled: boolean,
): LocalToolCapability {
  return {
    id,
    label,
    description,
    risk: 'read',
    enabled,
    requiresConsent: false,
    commandHint,
    approval: null,
  };
}

function writeCapability(
  id: string,
  label: string,
  description: string,
  commandHint: string | null,
  enabled: boolean,
): LocalToolCapability {
  return {
    id,
    label,
    description,
    risk: 'write',
    enabled,
    requiresConsent: true,
    commandHint,
    approval: null,
  };
}

function externalCapability(
  id: string,
  label: string,
  description: string,
  commandHint: string | null,
  enabled: boolean,
): LocalToolCapability {
  return {
    id,
    label,
    description,
    risk: 'external',
    enabled,
    requiresConsent: true,
    commandHint,
    approval: null,
  };
}

async function detectOpenClaw(): Promise<LocalToolStatus> {
  const checkedAt = checkedNow();
  const binary = await resolveBinary(['openclaw']);
  const gateway = readGatewayConfig();

  if (!binary) {
    return {
      id: 'openclaw',
      name: 'OpenClaw',
      category: 'agent',
      description: 'Local agent runtime used by Command and Quick Ask.',
      installed: false,
      path: null,
      version: null,
      authState: 'unknown',
      health: 'missing',
      detail: 'OpenClaw CLI is not installed or not on PATH.',
      setupHint: 'Install OpenClaw, then run `openclaw onboard` and `openclaw gateway start`.',
      docsUrl: 'https://github.com/openclaw/openclaw',
      capabilities: [
        safeCapability('agent.ask', 'Ask agent', 'Stream Sarah instructions through the local OpenClaw Gateway WebSocket.', null, false),
      ],
      signals: {
        configFound: gateway.configFound,
        tokenConfigured: gateway.tokenConfigured,
        gatewayReachable: false,
        gatewayPort: gateway.port,
      },
      checkedAt,
    };
  }

  const [version, whoami, gatewayReachable] = await Promise.all([
    resolveVersion(binary.path, [['--version'], ['version']]),
    run(binary.path, ['whoami'], 3500),
    gateway.configFound && gateway.tokenConfigured ? probePort(gateway.port) : Promise.resolve(false),
  ]);
  const whoamiText = `${whoami?.stdout ?? ''}\n${whoami?.stderr ?? ''}`.trim().toLowerCase();
  const whoamiAuthenticated = Boolean(whoami?.stdout.trim()) && !/not logged|login|unauthorized|401|403/.test(whoamiText);
  const gatewayReady = gateway.configFound && gateway.tokenConfigured && gatewayReachable;
  const authenticated = whoamiAuthenticated || gatewayReady;

  const health =
    gatewayReady
      ? 'ready'
      : 'needs_setup';
  const detail = health === 'ready'
    ? whoamiAuthenticated
      ? 'Gateway is reachable and OpenClaw authentication was confirmed.'
      : 'Gateway is reachable with a configured local token.'
    : !authenticated
      ? 'OpenClaw is installed but authentication was not confirmed.'
      : !gateway.configFound
        ? 'OpenClaw config is missing.'
        : !gateway.tokenConfigured
          ? 'Gateway token is missing from OpenClaw config.'
          : 'Gateway is configured but not reachable.';

  return {
    id: 'openclaw',
    name: 'OpenClaw',
    category: 'agent',
    description: 'Local agent runtime used by Command and Quick Ask.',
    installed: true,
    path: binary.path,
    version,
    authState: authenticated ? 'authenticated' : 'needs_auth',
    health,
    detail,
    setupHint: health === 'ready' ? null : 'Run `openclaw onboard`, then `openclaw gateway start` and `openclaw gateway probe`.',
    docsUrl: 'https://github.com/openclaw/openclaw',
    capabilities: [
      safeCapability('agent.ask', 'Ask agent', 'Stream Sarah instructions through the local OpenClaw Gateway WebSocket.', 'ws://127.0.0.1:<gateway-port>', health === 'ready'),
      externalCapability('gateway.manage', 'Manage Gateway', 'Start, restart, or stop the local OpenClaw Gateway.', 'openclaw gateway start', true),
    ],
    signals: {
      configFound: gateway.configFound,
      tokenConfigured: gateway.tokenConfigured,
      gatewayReachable,
      gatewayPort: gateway.port,
      whoamiAuthenticated,
    },
    checkedAt,
  };
}

async function detectOpenClawPeekaboo(): Promise<LocalToolStatus> {
  const checkedAt = checkedNow();
  const binary = await resolveBinary(['openclaw']);
  const skills = binary ? await run(binary.path, ['skills', 'list'], 5000) : null;
  const skillsText = `${skills?.stdout ?? ''}\n${skills?.stderr ?? ''}`.trim();
  const peekabooLine = skillsText
    .split('\n')
    .find((line) => /(^|\s)peekaboo(\s|$)/i.test(line)) ?? '';
  const hasPeekaboo = /(^|\s)peekaboo(\s|$)/i.test(skillsText);
  const needsSetup = hasPeekaboo && /needs\s+setup/i.test(peekabooLine);
  const ready = hasPeekaboo && !needsSetup;

  return {
    id: 'openclaw-peekaboo',
    name: 'OpenClaw Peekaboo',
    category: 'agent',
    description: 'OpenClaw screen capture and macOS UI automation skill.',
    installed: Boolean(binary) && hasPeekaboo,
    path: binary?.path ?? null,
    version: null,
    authState: 'unknown',
    health: ready ? 'ready' : binary ? 'needs_setup' : 'missing',
    detail: ready
      ? 'OpenClaw peekaboo skill is available for screen capture and macOS UI automation.'
      : binary
        ? hasPeekaboo
          ? 'OpenClaw peekaboo skill is present but still needs setup.'
          : 'OpenClaw is installed, but the peekaboo skill was not found.'
        : 'OpenClaw CLI is required before peekaboo can be configured.',
    setupHint: ready ? null : 'Run `openclaw skills list` and follow the peekaboo setup instructions.',
    docsUrl: null,
    capabilities: [
      safeCapability('status', 'Check status', 'Check whether OpenClaw peekaboo is present and ready.', 'openclaw skills list', Boolean(binary)),
      externalCapability('setup', 'Show setup', 'Open the OpenClaw peekaboo setup details in Terminal.', 'openclaw skills info peekaboo', Boolean(binary) && hasPeekaboo && !ready),
      externalCapability('desktop.operate', 'Desktop control', 'Let OpenClaw use peekaboo for screen capture and macOS UI automation.', 'openclaw skills list', ready),
    ],
    signals: {
      openclawFound: Boolean(binary),
      peekabooFound: hasPeekaboo,
      needsSetup,
      statusText: skillsText.slice(0, 240),
    },
    checkedAt,
  };
}

function parseHermesAuthenticated(output: string): boolean {
  const lower = output.toLowerCase();
  const providerConfigured = /provider:\s+(?!\(?not\s+set\)?)([^\n]+)/i.test(output);
  const modelConfigured = /model:\s+(?!\(?not\s+set\)?)([^\n]+)/i.test(output);
  const hasUsableKey = /✓/.test(output) || /configured/i.test(output);
  return (providerConfigured || modelConfigured) && hasUsableKey && !/no api keys configured/.test(lower);
}

async function detectHermes(): Promise<LocalToolStatus> {
  const checkedAt = checkedNow();
  const binary = await resolveBinary(['hermes']);
  const desktopConfigFound = fs.existsSync(path.join(HERMES_DESKTOP_SUPPORT, 'connections.json'));
  const hermesHomeFound = fs.existsSync(HERMES_HOME);
  const launchAgentFound = fs.existsSync(HERMES_LAUNCH_AGENT);

  if (!binary) {
    return {
      id: 'hermes',
      name: 'Hermes',
      category: 'agent',
      description: 'Local agent runtime available for Command and Quick Ask.',
      installed: desktopConfigFound || hermesHomeFound,
      path: null,
      version: null,
      authState: 'unknown',
      health: desktopConfigFound || hermesHomeFound ? 'needs_setup' : 'missing',
      detail: desktopConfigFound || hermesHomeFound
        ? 'Hermes files were detected, but the CLI was not found on PATH.'
        : 'Hermes CLI is not installed or not on PATH.',
      setupHint: 'Install Hermes CLI or add it to ~/.local/bin, /opt/homebrew/bin, or /usr/local/bin.',
      docsUrl: null,
      capabilities: [
        safeCapability('agent.ask', 'Ask agent', 'Run Sarah instructions through the Hermes CLI fallback.', null, false),
      ],
      signals: {
        desktopConfigFound,
        hermesHomeFound,
        launchAgentFound,
      },
      checkedAt,
    };
  }

  const [version, status] = await Promise.all([
    resolveVersion(binary.path, [['--version'], ['version']]),
    run(binary.path, ['status'], 5000),
  ]);
  const statusText = `${status?.stdout ?? ''}\n${status?.stderr ?? ''}`;
  const authenticated = parseHermesAuthenticated(statusText);

  return {
    id: 'hermes',
    name: 'Hermes',
    category: 'agent',
    description: 'Local agent runtime available for Command and Quick Ask.',
    installed: true,
    path: binary.path,
    version,
    authState: authenticated ? 'authenticated' : 'needs_auth',
    health: authenticated ? 'ready' : 'needs_setup',
    detail: authenticated
      ? 'Hermes is installed and model/auth configuration was detected.'
      : 'Hermes is installed, but model/auth setup was not confirmed.',
    setupHint: authenticated ? null : 'Run `hermes setup`, `hermes model`, or `hermes status` to finish setup.',
    docsUrl: null,
    capabilities: [
      safeCapability('agent.ask', 'Ask agent', 'Run Sarah instructions through the Hermes CLI fallback.', 'hermes --oneshot', authenticated),
      externalCapability('gateway.manage', 'Manage Gateway', 'Start, restart, or stop the local Hermes Gateway.', 'hermes gateway start', true),
    ],
    signals: {
      desktopConfigFound,
      hermesHomeFound,
      launchAgentFound,
    },
    checkedAt,
  };
}

async function detectHermesComputerUse(): Promise<LocalToolStatus> {
  const checkedAt = checkedNow();
  const hermes = await resolveBinary(['hermes']);
  const cua = await resolveBinary(['cua-driver']);
  const status = hermes ? await run(hermes.path, ['computer-use', 'status'], 3500) : null;
  const statusText = `${status?.stdout ?? ''}\n${status?.stderr ?? ''}`.trim();
  const ready = Boolean(cua) || /cua-driver:\s*(installed|ready|ok)/i.test(statusText);
  const installed = Boolean(hermes);

  return {
    id: 'hermes-computer-use',
    name: 'Hermes Computer Use',
    category: 'agent',
    description: 'Hermes macOS background Computer Use backend powered by cua-driver.',
    installed,
    path: cua?.path ?? hermes?.path ?? null,
    version: null,
    authState: ready ? 'not_required' : 'unknown',
    health: ready ? 'ready' : installed ? 'needs_setup' : 'missing',
    detail: ready
      ? 'cua-driver is installed; Hermes can use the `computer_use` toolset for macOS app automation.'
      : installed
        ? 'Hermes is installed, but cua-driver is not installed yet.'
        : 'Hermes CLI is required before Computer Use can be configured.',
    setupHint: ready ? null : 'Run `hermes computer-use install`, then grant Accessibility and Screen Recording when macOS asks.',
    docsUrl: 'https://github.com/trycua/cua',
    capabilities: [
      safeCapability('status', 'Check status', 'Check whether cua-driver is installed and available.', hermes ? `${hermes.path} computer-use status` : 'hermes computer-use status', installed),
      externalCapability('setup', 'Install backend', 'Open the Hermes Computer Use installer in Terminal. This downloads and installs cua-driver.', hermes ? `${hermes.path} computer-use install` : 'hermes computer-use install', installed && !ready),
      externalCapability('desktop.operate', 'Desktop control', 'Let Hermes drive macOS apps in the background through the computer_use toolset.', 'hermes --toolsets computer_use', ready),
    ],
    signals: {
      hermesFound: Boolean(hermes),
      cuaDriverFound: Boolean(cua),
      statusText: statusText.slice(0, 240),
    },
    checkedAt,
  };
}

async function detectCodex(): Promise<LocalToolStatus> {
  const checkedAt = checkedNow();
  const binary = await resolveBinary(['codex']);
  const configFound = fs.existsSync(CODEX_HOME);

  if (!binary) {
    return {
      id: 'codex',
      name: 'Codex',
      category: 'agent',
      description: 'OpenAI Codex CLI runtime available for Command and Quick Ask.',
      installed: configFound,
      path: null,
      version: null,
      authState: 'unknown',
      health: configFound ? 'needs_setup' : 'missing',
      detail: configFound ? 'Codex config exists, but the CLI was not found on PATH.' : 'Codex CLI is not installed or not on PATH.',
      setupHint: 'Install with `npm i -g @openai/codex` or `brew install --cask codex`, then run `codex` to sign in.',
      docsUrl: 'https://developers.openai.com/codex/cli',
      capabilities: [
        safeCapability('agent.ask', 'Ask agent', 'Run Sarah instructions through Codex exec.', null, false),
      ],
      signals: { configFound },
      checkedAt,
    };
  }

  const version = await resolveVersion(binary.path, [['--version'], ['version']]);
  const ready = configFound;
  return {
    id: 'codex',
    name: 'Codex',
    category: 'agent',
    description: 'OpenAI Codex CLI runtime available for Command and Quick Ask.',
    installed: true,
    path: binary.path,
    version,
    authState: ready ? 'authenticated' : 'unknown',
    health: ready ? 'ready' : 'needs_setup',
    detail: ready
      ? 'Codex CLI is installed and local config was detected.'
      : 'Codex CLI is installed, but sign-in/config was not confirmed.',
    setupHint: ready ? null : 'Run `codex` once and sign in before using it from Sarah.',
    docsUrl: 'https://developers.openai.com/codex/cli',
    capabilities: [
      safeCapability('agent.ask', 'Ask agent', 'Run Sarah instructions through Codex exec.', `${binary.path} exec`, true),
    ],
    signals: { command: binary.command, configFound },
    checkedAt,
  };
}

async function detectClaude(): Promise<LocalToolStatus> {
  const checkedAt = checkedNow();
  const binary = await resolveBinary(['claude']);
  const configFound = fs.existsSync(CLAUDE_HOME);

  if (!binary) {
    return {
      id: 'claude',
      name: 'Claude Code',
      category: 'agent',
      description: 'Claude Code CLI runtime available for Command and Quick Ask.',
      installed: configFound,
      path: null,
      version: null,
      authState: 'unknown',
      health: configFound ? 'needs_setup' : 'missing',
      detail: configFound ? 'Claude config exists, but the CLI was not found on PATH.' : 'Claude Code CLI is not installed or not on PATH.',
      setupHint: 'Install Claude Code, then run `claude` to sign in.',
      docsUrl: 'https://docs.claude.com/en/docs/claude-code/headless',
      capabilities: [
        safeCapability('agent.ask', 'Ask agent', 'Run Sarah instructions through Claude Code print mode.', null, false),
      ],
      signals: { configFound },
      checkedAt,
    };
  }

  const version = await resolveVersion(binary.path, [['--version'], ['version']]);
  const ready = configFound;
  return {
    id: 'claude',
    name: 'Claude Code',
    category: 'agent',
    description: 'Claude Code CLI runtime available for Command and Quick Ask.',
    installed: true,
    path: binary.path,
    version,
    authState: ready ? 'authenticated' : 'unknown',
    health: ready ? 'ready' : 'needs_setup',
    detail: ready
      ? 'Claude Code CLI is installed and local config was detected.'
      : 'Claude Code CLI is installed, but sign-in/config was not confirmed.',
    setupHint: ready ? null : 'Run `claude` once and sign in before using it from Sarah.',
    docsUrl: 'https://docs.claude.com/en/docs/claude-code/headless',
    capabilities: [
      safeCapability('agent.ask', 'Ask agent', 'Run Sarah instructions through Claude Code print mode.', `${binary.path} -p`, true),
    ],
    signals: { command: binary.command, configFound },
    checkedAt,
  };
}

async function detectObsidian(): Promise<LocalToolStatus> {
  const checkedAt = checkedNow();
  const cli = await resolveBinary(['obsidian']);
  const appCandidates = [
    '/Applications/Obsidian.app',
    path.join(os.homedir(), 'Applications', 'Obsidian.app'),
  ];
  const appPath = appCandidates.find((candidate) => fs.existsSync(candidate)) ?? null;
  const spotlight = appPath
    ? null
    : await run('mdfind', ['kMDItemCFBundleIdentifier == "md.obsidian"'], 1800);
  const spotlightPath = spotlight?.stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.endsWith('.app')) ?? null;
  const installed = Boolean(cli || appPath || spotlightPath);

  return {
    id: 'obsidian',
    name: 'Obsidian',
    category: 'knowledge',
    description: 'Local knowledge base target for notes and memory export.',
    installed,
    path: cli?.path ?? appPath ?? spotlightPath,
    version: cli ? await resolveVersion(cli.path, [['--version'], ['version']]) : null,
    authState: 'not_required',
    health: installed ? 'ready' : 'missing',
    detail: installed
      ? 'Obsidian app or CLI was detected; URI-based note workflows can be enabled.'
      : 'Obsidian was not detected.',
    setupHint: installed ? null : 'Install Obsidian. Optional CLI support can be added later per vault.',
    docsUrl: 'https://help.obsidian.md/',
    capabilities: [
      safeCapability('vault.open', 'Open vault links', 'Open Obsidian URI links without changing notes.', 'obsidian://open', installed),
      writeCapability('note.create', 'Create note', 'Create or append notes in a user-approved vault.', 'obsidian://new', installed),
    ],
    signals: {
      appDetected: Boolean(appPath || spotlightPath),
      cliDetected: Boolean(cli),
      uriSchemeAssumed: installed,
    },
    checkedAt,
  };
}

async function detectLarkCli(): Promise<LocalToolStatus> {
  const checkedAt = checkedNow();
  const binary = await resolveBinary(['lark-cli', 'lark', 'feishu']);

  if (!binary) {
    return {
      id: 'lark-cli',
      name: 'Feishu / Lark CLI',
      category: 'productivity',
      description: 'Local CLI bridge for Feishu/Lark docs, messages, calendar, and tasks.',
      installed: false,
      path: null,
      version: null,
      authState: 'unknown',
      health: 'missing',
      detail: 'No Feishu/Lark CLI command was found.',
      setupHint: 'Install and authenticate a Feishu/Lark CLI before enabling write actions.',
      docsUrl: null,
      capabilities: [
        safeCapability('docs.read', 'Read docs', 'Read Feishu/Lark documents after authentication.', null, false),
        externalCapability('im.send', 'Send message', 'Send Feishu/Lark messages with explicit approval.', null, false),
      ],
      signals: { command: null },
      checkedAt,
    };
  }

  const version = await resolveVersion(binary.path, [['--version'], ['version']]);
  let authProbe: { stdout: string; stderr: string } | null = null;
  for (const args of [['auth', 'status'], ['whoami'], ['me']]) {
    authProbe = await run(binary.path, args, 2500);
    if (authProbe) break;
  }
  const authText = `${authProbe?.stdout ?? ''}\n${authProbe?.stderr ?? ''}`.trim();
  const negative = /not logged|login required|unauthorized|permission denied|未登录|请登录/i.test(authText);
  const authenticated = Boolean(authProbe?.stdout.trim()) && !negative;
  const authState = authenticated ? 'authenticated' : authText ? 'needs_auth' : 'unknown';
  const ready = authState === 'authenticated';

  return {
    id: 'lark-cli',
    name: 'Feishu / Lark CLI',
    category: 'productivity',
    description: 'Local CLI bridge for Feishu/Lark docs, messages, calendar, and tasks.',
    installed: true,
    path: binary.path,
    version,
    authState,
    health: ready ? 'ready' : 'needs_setup',
    detail: ready
      ? 'CLI is installed and authentication was detected.'
      : 'CLI is installed, but authentication still needs confirmation.',
    setupHint: ready ? null : `Run the ${binary.command} auth/login flow before enabling Feishu actions.`,
    docsUrl: null,
    capabilities: [
      safeCapability('docs.read', 'Read docs', 'Read Feishu/Lark documents after authentication.', `${binary.path} docs`, ready),
      writeCapability('docs.write', 'Write docs', 'Create or update Feishu/Lark documents with explicit approval.', `${binary.path} docs`, ready),
      writeCapability('visible-context.create-doc', 'Save screen', 'Create a Feishu/Lark document from the captured app, URL, OCR text, and Sarah answer.', `${binary.path} docs +create`, ready),
      safeCapability('drive.read', 'Find files', 'Search and inspect Feishu/Lark Drive files and folders.', `${binary.path} drive`, ready),
      writeCapability('drive.write', 'Write files', 'Create folders, upload files, or move Feishu/Lark Drive content with explicit approval.', `${binary.path} drive`, ready),
      externalCapability('im.send', 'Send message', 'Send Feishu/Lark messages only after explicit approval.', `${binary.path} im`, ready),
    ],
    signals: {
      command: binary.command,
      authProbeReturnedText: Boolean(authText),
    },
    checkedAt,
  };
}

function hydrateApprovals(tools: LocalToolStatus[]): LocalToolStatus[] {
  return tools.map((tool) => ({
    ...tool,
    capabilities: tool.capabilities.map((capability) => ({
      ...capability,
      approval: approvalStore.get(tool.id, capability.id),
    })),
  }));
}

export class LocalToolsService {
  private cache: { snapshot: LocalToolsSnapshot; expiresAt: number } | null = null;

  private invalidateCache(): void {
    this.cache = null;
  }

  async getSnapshot(): Promise<LocalToolsSnapshot> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.snapshot;
    }

    const results = await Promise.allSettled([
      detectOpenClaw(),
      detectOpenClawPeekaboo(),
      detectHermes(),
      detectHermesComputerUse(),
      detectCodex(),
      detectClaude(),
      detectObsidian(),
      detectLarkCli(),
    ]);
    const tools = results.map((result, index) => {
      if (result.status === 'fulfilled') return result.value;
      const ids = ['openclaw', 'openclaw-peekaboo', 'hermes', 'hermes-computer-use', 'codex', 'claude', 'obsidian', 'lark-cli'] as const;
      logger.warn('Local tool detection failed', {
        toolId: ids[index],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      return {
        id: ids[index],
        name: ids[index],
        category: 'productivity',
        description: 'Tool detection failed.',
        installed: false,
        path: null,
        version: null,
        authState: 'unknown',
        health: 'unknown',
        detail: 'Detection failed. Check logs for details.',
        setupHint: null,
        docsUrl: null,
        capabilities: [],
        signals: {},
        checkedAt: checkedNow(),
      } satisfies LocalToolStatus;
    });

    const hydrated = hydrateApprovals(tools);
    const snapshot = {
      checkedAt: checkedNow(),
      ready: hydrated.filter((tool) => tool.health === 'ready').length,
      needsSetup: hydrated.filter((tool) => tool.health === 'needs_setup').length,
      missing: hydrated.filter((tool) => tool.health === 'missing').length,
      tools: hydrated,
    };
    this.cache = { snapshot, expiresAt: Date.now() + 15_000 };
    return snapshot;
  }

  async setApproval(
    toolId: LocalToolId,
    capabilityId: string,
    scope: LocalToolApprovalScope,
  ): Promise<LocalToolsSnapshot> {
    approvalStore.set(toolId, capabilityId, scope);
    this.invalidateCache();
    return this.getSnapshot();
  }

  async revokeApproval(
    toolId: LocalToolId,
    capabilityId: string,
  ): Promise<LocalToolsSnapshot> {
    approvalStore.revoke(toolId, capabilityId);
    this.invalidateCache();
    return this.getSnapshot();
  }

  async execute(request: LocalToolExecutionRequest): Promise<LocalToolExecutionResult> {
    const snapshot = await this.getSnapshot();
    const tool = snapshot.tools.find((entry) => entry.id === request.toolId);
    if (!tool) {
      return { success: false, error: `Unknown tool ${request.toolId}.` };
    }
    const capability = tool.capabilities.find((entry) => entry.id === request.capabilityId);
    if (!capability) {
      return { success: false, error: `Unknown capability ${request.capabilityId}.` };
    }
    if (!capability.enabled) {
      return {
        success: false,
        error: `${tool.name} is not ready: ${tool.detail}`,
      };
    }
    if (capability.requiresConsent && !approvalStore.isApproved(request.toolId, request.capabilityId)) {
      return {
        success: false,
        requiresApproval: true,
        error: `${capability.label} requires approval before it can run.`,
      };
    }

    const result = await executeCapability(request.toolId, request.capabilityId, request.args ?? {});
    if (result.success && capability.requiresConsent) {
      approvalStore.consume(request.toolId, request.capabilityId);
      this.invalidateCache();
    }
    return result;
  }

  async getAgentContextSummary(): Promise<string> {
    const snapshot = await this.getSnapshot();
    const lines = snapshot.tools
      .map((tool) => {
        const capabilities = tool.capabilities
          .filter((capability) => capability.enabled)
          .map((capability) => {
            const approved = capability.approval ? ' (approved)' : capability.requiresConsent ? ' (needs approval)' : '';
            const command = capability.commandHint ? ` via ${capability.commandHint}` : '';
            return `${capability.label}${approved}${command}`;
          })
          .join(', ') || 'no enabled actions';
        const pathHint = tool.path ? ` path=${tool.path};` : '';
        return `- ${tool.name}: ${tool.health};${pathHint} ${tool.detail}; capabilities: ${capabilities}`;
      })
      .join('\n');
    const lark = snapshot.tools.find((tool) => tool.id === 'lark-cli' && tool.health === 'ready');
    const larkCommand = lark?.path ?? (lark?.signals.command ? String(lark.signals.command) : null);
    const larkGuide = larkCommand
      ? [
          '',
          'Feishu/Lark CLI operating notes:',
          `- The concrete Feishu CLI command on this Mac is \`${larkCommand}\`; prefer this exact binary path instead of guessing \`lark\` or \`feishu\`.`,
          `- Inspect auth with \`${larkCommand} auth status\` and health with \`${larkCommand} doctor\`.`,
          `- For docs/wiki/drive tasks, use \`${larkCommand} docs ...\`, \`${larkCommand} drive ...\`, or \`${larkCommand} wiki ...\` after checking command help/schema.`,
          `- For write/send actions, proceed only after Sarah/user approval or when the user explicitly asked for that write action.`,
        ].join('\n')
      : '';
    return `${lines}${larkGuide}`;
  }
}

export const localToolsService = new LocalToolsService();
