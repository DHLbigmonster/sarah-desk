import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import log from 'electron-log';
import type {
  LocalToolCapability,
  LocalToolsSnapshot,
  LocalToolStatus,
} from '../../../shared/types/local-tools';

const execFileAsync = promisify(execFile);
const logger = log.scope('local-tools');

const DEFAULT_OPENCLAW_PORT = 18789;
const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
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
        safeCapability('agent.ask', 'Ask agent', 'Run Sarah instructions through the local OpenClaw Gateway.', null, false),
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
      safeCapability('agent.ask', 'Ask agent', 'Run Sarah instructions through the local OpenClaw Gateway.', 'openclaw gateway call agent', health === 'ready'),
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
      safeCapability('docs.read', 'Read docs', 'Read Feishu/Lark documents after authentication.', `${binary.command} doc`, ready),
      writeCapability('docs.write', 'Write docs', 'Create or update Feishu/Lark documents with explicit approval.', `${binary.command} doc`, ready),
      externalCapability('im.send', 'Send message', 'Send Feishu/Lark messages only after explicit approval.', `${binary.command} im`, ready),
    ],
    signals: {
      command: binary.command,
      authProbeReturnedText: Boolean(authText),
    },
    checkedAt,
  };
}

export class LocalToolsService {
  private cache: { snapshot: LocalToolsSnapshot; expiresAt: number } | null = null;

  async getSnapshot(): Promise<LocalToolsSnapshot> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.snapshot;
    }

    const results = await Promise.allSettled([
      detectOpenClaw(),
      detectObsidian(),
      detectLarkCli(),
    ]);
    const tools = results.map((result, index) => {
      if (result.status === 'fulfilled') return result.value;
      const ids = ['openclaw', 'obsidian', 'lark-cli'] as const;
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

    const snapshot = {
      checkedAt: checkedNow(),
      ready: tools.filter((tool) => tool.health === 'ready').length,
      needsSetup: tools.filter((tool) => tool.health === 'needs_setup').length,
      missing: tools.filter((tool) => tool.health === 'missing').length,
      tools,
    };
    this.cache = { snapshot, expiresAt: Date.now() + 15_000 };
    return snapshot;
  }

  async getAgentContextSummary(): Promise<string> {
    const snapshot = await this.getSnapshot();
    return snapshot.tools
      .map((tool) => {
        const capabilities = tool.capabilities
          .filter((capability) => capability.enabled)
          .map((capability) => `${capability.label}${capability.requiresConsent ? ' (needs approval)' : ''}`)
          .join(', ') || 'no enabled actions';
        return `- ${tool.name}: ${tool.health}; ${tool.detail}; capabilities: ${capabilities}`;
      })
      .join('\n');
  }
}

export const localToolsService = new LocalToolsService();
