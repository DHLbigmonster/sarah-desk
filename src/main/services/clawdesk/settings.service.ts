import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import log from 'electron-log';
import { resolve, isFromCredentialStore } from '../config/resolve-config';
import type {
  ClawDeskCliToolDefinition,
  ClawDeskCliToolStatus,
  ClawDeskProviderSummaryItem,
  ClawDeskSkillDetail,
  ClawDeskSettingsOverview,
  ClawDeskSkillItem,
  ClawDeskThemeMode,
  ClawDeskVersionInfo,
  HotkeyConfig,
  HotkeyCheckResult,
  OpenClawStatus,
} from '../../../shared/types/clawdesk-settings';
import { DEFAULT_HOTKEY_CONFIG } from '../../../shared/types/clawdesk-settings';

const execFileAsync = promisify(execFile);
const logger = log.scope('clawdesk-settings');

const SETTINGS_FILENAME = 'clawdesk-settings.json';
const PROJECT_ENV_PATH = path.join(process.cwd(), '.env');
const PROJECT_ENV_EXAMPLE_PATH = path.join(process.cwd(), '.env.example');
const SKILL_SOURCES = [
  { source: 'codex' as const, dir: path.join(os.homedir(), '.codex', 'skills') },
  { source: 'agents' as const, dir: path.join(os.homedir(), '.agents', 'skills') },
  { source: 'openclaw' as const, dir: path.join(os.homedir(), '.openclaw', 'skills') },
];

const CLI_CATALOG: ClawDeskCliToolDefinition[] = [
  {
    id: 'git',
    name: 'Git',
    description: '版本控制基础工具，负责仓库管理、分支和提交历史。',
    category: 'system',
    command: 'git',
    versionArgs: [['--version']],
    recommended: true,
    source: 'CodePilot-inspired baseline',
    installCommand: 'brew install git',
    detailIntro: 'Git 是桌面开发环境的基础工具，负责克隆仓库、分支切换、提交和发布流程。很多 Agent 工作流默认依赖它。',
    docsUrl: 'https://git-scm.com/doc',
    repoUrl: 'https://github.com/git/git',
    authRequired: false,
    postInstallNotes: ['安装后可运行 git --version 验证。'],
  },
  {
    id: 'gh',
    name: 'GitHub CLI',
    description: '适合 issue、PR、release 和 GitHub 发布流程的命令行工具。',
    category: 'devops',
    command: 'gh',
    versionArgs: [['--version']],
    recommended: true,
    source: 'CodePilot / GitHub workflow',
    installCommand: 'brew install gh',
    detailIntro: 'GitHub CLI 适合 issue、PR、release 和登录 GitHub 账号的命令行工作流，也是自动发布和代码协作的关键工具。',
    docsUrl: 'https://cli.github.com/manual/',
    repoUrl: 'https://github.com/cli/cli',
    authRequired: true,
    postInstallNotes: ['安装后建议运行 gh auth login 完成登录。'],
  },
  {
    id: 'node',
    name: 'Node.js',
    description: '当前桌面应用和大部分 Agent CLI 的运行时基础。',
    category: 'runtime',
    command: 'node',
    versionArgs: [['--version']],
    recommended: true,
    source: 'Current project runtime',
    installCommand: 'brew install node',
    detailIntro: 'Node.js 是当前 Electron 桌面应用和许多 CLI 工具的基础运行时。',
    docsUrl: 'https://nodejs.org/en/docs',
    repoUrl: 'https://github.com/nodejs/node',
    authRequired: false,
    postInstallNotes: ['安装后可运行 node --version 与 npm --version 验证。'],
  },
  {
    id: 'python3',
    name: 'Python 3',
    description: '通用脚本运行时，适合数据处理、自动化和部分 Agent 工具链。',
    category: 'runtime',
    command: 'python3',
    versionArgs: [['--version']],
    recommended: true,
    source: 'Current project runtime',
    installCommand: 'brew install python',
    detailIntro: 'Python 3 常用于自动化、数据处理和若干 AI/Agent 辅助脚本。',
    docsUrl: 'https://docs.python.org/3/',
    repoUrl: 'https://github.com/python/cpython',
    authRequired: false,
    postInstallNotes: ['安装后可运行 python3 --version 验证。'],
  },
  {
    id: 'jq',
    name: 'jq',
    description: '轻量 JSON 处理器，适合配置、响应和日志处理。',
    category: 'data',
    command: 'jq',
    versionArgs: [['--version']],
    recommended: true,
    source: 'CodePilot catalog',
    installCommand: 'brew install jq',
    detailIntro: 'jq 是轻量 JSON 处理器，适合处理 API 响应、配置文件和结构化日志。',
    docsUrl: 'https://jqlang.github.io/jq/manual/',
    repoUrl: 'https://github.com/jqlang/jq',
    authRequired: false,
    postInstallNotes: ['安装后可运行 jq --version 验证。'],
  },
  {
    id: 'ripgrep',
    name: 'ripgrep',
    description: '极速文本搜索工具，适合代码仓库和本地知识搜索。',
    category: 'search',
    command: 'rg',
    versionArgs: [['--version']],
    recommended: true,
    source: 'CodePilot catalog',
    installCommand: 'brew install ripgrep',
    detailIntro: 'ripgrep 是面向代码库和文本目录的极速搜索工具，很多开发工作流会优先使用它替代 grep。',
    docsUrl: 'https://github.com/BurntSushi/ripgrep',
    repoUrl: 'https://github.com/BurntSushi/ripgrep',
    authRequired: false,
    postInstallNotes: ['安装后可运行 rg --version 验证。'],
  },
  {
    id: 'curl',
    name: 'curl',
    description: '通用 HTTP 调试工具，适合接口探测和下载任务。',
    category: 'network',
    command: 'curl',
    versionArgs: [['--version']],
    recommended: true,
    source: 'CodePilot-style system baseline',
    installCommand: null,
    detailIntro: 'curl 是通用 HTTP 调试工具，很多系统默认自带，适合接口探测、文件下载和鉴权请求。',
    docsUrl: 'https://curl.se/docs/',
    repoUrl: 'https://github.com/curl/curl',
    authRequired: false,
    postInstallNotes: ['多数 macOS 系统默认已自带 curl。'],
  },
  {
    id: 'ffmpeg',
    name: 'FFmpeg',
    description: '音视频处理工具，适合转码、抽音频和素材预处理。',
    category: 'media',
    command: 'ffmpeg',
    versionArgs: [['-version'], ['--version']],
    recommended: true,
    source: 'CodePilot catalog',
    installCommand: 'brew install ffmpeg',
    detailIntro: 'FFmpeg 是音视频处理常用工具，适合转码、剪辑、抽音频和素材预处理。',
    docsUrl: 'https://ffmpeg.org/documentation.html',
    repoUrl: 'https://github.com/FFmpeg/FFmpeg',
    authRequired: false,
    postInstallNotes: ['安装后可运行 ffmpeg -version 验证。'],
  },
  {
    id: 'pandoc',
    name: 'Pandoc',
    description: '文档格式转换器，适合 Markdown、HTML、PDF 和 DOCX 流程。',
    category: 'documents',
    command: 'pandoc',
    versionArgs: [['--version']],
    recommended: true,
    source: 'CodePilot catalog',
    installCommand: 'brew install pandoc',
    detailIntro: 'Pandoc 是通用文档格式转换器，适合 Markdown、HTML、PDF、DOCX 等多种格式转换。',
    docsUrl: 'https://pandoc.org/MANUAL.html',
    repoUrl: 'https://github.com/jgm/pandoc',
    authRequired: false,
    postInstallNotes: ['安装后可运行 pandoc --version 验证。'],
  },
  {
    id: 'yt-dlp',
    name: 'yt-dlp',
    description: '下载在线视频和音频素材的实用工具。',
    category: 'media',
    command: 'yt-dlp',
    versionArgs: [['--version']],
    recommended: true,
    source: 'CodePilot catalog',
    installCommand: 'brew install yt-dlp',
    detailIntro: 'yt-dlp 是在线视频与音频素材下载工具，适合内容归档和离线处理。',
    docsUrl: 'https://github.com/yt-dlp/yt-dlp#readme',
    repoUrl: 'https://github.com/yt-dlp/yt-dlp',
    authRequired: false,
    postInstallNotes: ['安装后可运行 yt-dlp --version 验证。'],
  },
  {
    id: 'sqlite3',
    name: 'SQLite',
    description: '轻量数据库工具，适合本地数据检查和调试。',
    category: 'data',
    command: 'sqlite3',
    versionArgs: [['--version']],
    recommended: true,
    source: 'CodePilot-style system baseline',
    installCommand: 'brew install sqlite',
    detailIntro: 'SQLite 命令行适合检查本地数据库、执行查询和快速调试持久化数据。',
    docsUrl: 'https://sqlite.org/docs.html',
    repoUrl: 'https://github.com/sqlite/sqlite',
    authRequired: false,
    postInstallNotes: ['安装后可运行 sqlite3 --version 验证。'],
  },
  {
    id: 'openclaw',
    name: 'OpenClaw CLI',
    description: 'OpenClaw 的本地命令行入口，用于 gateway 和 workspace 能力。',
    category: 'agent',
    command: 'openclaw',
    versionArgs: [['--version'], ['version']],
    recommended: true,
    source: 'Current OpenClaw integration',
    installCommand: 'brew install openclaw',
    detailIntro: 'OpenClaw CLI 是 AI 代理运行时，为 Sarah 的 Mode 2（语音代理）和 Mode 3（截图代理）提供底层能力。Mode 1（听写）不需要它。',
    docsUrl: 'https://github.com/openclaw/openclaw',
    repoUrl: 'https://github.com/openclaw/openclaw',
    authRequired: true,
    postInstallNotes: [
      '安装后运行 openclaw login 进行认证。',
      '验证安装：which openclaw && openclaw --version',
      '如遇 PATH 问题，请确保 Homebrew bin 目录在 PATH 中。',
    ],
  },
  {
    id: 'lark-cli',
    name: 'Lark CLI',
    description: '飞书/Lark 工作流命令行工具，适合多种办公自动化场景。',
    category: 'productivity',
    command: 'lark-cli',
    versionArgs: [['--version'], ['version']],
    recommended: true,
    source: 'Agent skill ecosystem',
    installCommand: null,
    detailIntro: 'Lark CLI 适合飞书/Lark 工作流自动化，但它通常需要额外的登录和权限配置才能真正使用。',
    docsUrl: null,
    repoUrl: null,
    authRequired: true,
    postInstallNotes: ['该工具安装后通常还需要登录和权限配置。'],
  },
];

// Known macOS system shortcuts — warn user if they pick one of these
const SYSTEM_RESERVED_ACCELERATORS = new Set([
  'Command+Space',
  'Command+Tab',
  'Command+Shift+3',
  'Command+Shift+4',
  'Command+Shift+5',
  'Command+Q',
  'Command+W',
  'Command+H',
  'Command+M',
  'Control+Space',
  'Command+Option+Esc',
]);

interface StoredSettings {
  themeMode: ClawDeskThemeMode;
  hotkeyConfig?: HotkeyConfig;
}

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), SETTINGS_FILENAME);
}

function readFirstMeaningfulParagraph(markdown: string): string {
  const lines = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.startsWith('#')) continue;
    if (line.startsWith('```')) continue;
    if (line.startsWith('- ')) continue;
    if (line.startsWith('* ')) continue;
    if (line.startsWith('>')) continue;
    return line.replace(/\s+/g, ' ').slice(0, 180);
  }

  return 'No description available.';
}

function extractOverview(markdown: string): string {
  const paragraphs = markdown
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !block.startsWith('#'))
    .filter((block) => !block.startsWith('```'))
    .filter((block) => !/^[-*]\s/.test(block))
    .slice(0, 2)
    .map((block) => block.replace(/\s+/g, ' '));

  if (paragraphs.length > 0) {
    return paragraphs.join('\n\n').slice(0, 600);
  }

  return readFirstMeaningfulParagraph(markdown);
}

function readSkillMetadata(skillPath: string): Pick<ClawDeskSkillItem, 'name' | 'description' | 'commandName' | 'editable'> {
  const folderName = path.basename(path.dirname(skillPath));
  const fallbackName = folderName.replace(/[-_]+/g, ' ');
  const editable = !skillPath.startsWith(path.join(os.homedir(), '.openclaw'));

  try {
    const raw = fs.readFileSync(skillPath, 'utf8');
    const headingMatch = raw.match(/^#\s+(.+)$/m);
    const name = headingMatch?.[1]?.trim() || fallbackName;
    const description = readFirstMeaningfulParagraph(raw);
    return {
      name,
      description,
      commandName: `/${folderName}`,
      editable,
    };
  } catch {
    return {
      name: fallbackName,
      description: 'Failed to read skill metadata.',
      commandName: `/${folderName}`,
      editable,
    };
  }
}

function walkSkillFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const result: string[] = [];
  const stack = [dir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === 'SKILL.md') {
        result.push(fullPath);
      }
    }
  }

  return result.sort((a, b) => a.localeCompare(b));
}

function parseVersionLine(output: string): string | null {
  const line = output
    .split('\n')
    .map((item) => item.trim())
    .find(Boolean);
  return line || null;
}

async function resolveBinary(binary: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('which', [binary]);
    const resolved = stdout.trim();
    return resolved || null;
  } catch {
    return null;
  }
}

async function resolveVersion(binaryPath: string, commands: string[][]): Promise<string | null> {
  for (const args of commands) {
    try {
      const { stdout, stderr } = await execFileAsync(binaryPath, args, { timeout: 2000 });
      const version = parseVersionLine(stdout) || parseVersionLine(stderr);
      if (version) return version;
    } catch {
      continue;
    }
  }
  return null;
}

export class ClawDeskSettingsService {
  private cachedPackageInfo:
    | {
        versionInfo: ClawDeskVersionInfo;
      }
    | null = null;

  private readSettings(): StoredSettings {
    try {
      const raw = fs.readFileSync(getSettingsPath(), 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoredSettings>;
      const hotkeyConfig =
        parsed.hotkeyConfig &&
        typeof parsed.hotkeyConfig.voiceTriggerKey === 'string' &&
        typeof parsed.hotkeyConfig.toggleWindow === 'string'
          ? parsed.hotkeyConfig
          : undefined;
      return {
        themeMode: parsed.themeMode ?? 'system',
        hotkeyConfig,
      };
    } catch {
      return { themeMode: 'system' };
    }
  }

  private writeSettings(next: StoredSettings): void {
    const filePath = getSettingsPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8');
  }

  async getSettingsOverview(): Promise<ClawDeskSettingsOverview> {
    const settings = this.readSettings();
    return {
      themeMode: settings.themeMode,
      versionInfo: this.getVersionInfo(),
      providers: this.getProviderSummary(),
      skills: this.scanSkills(),
      cliCatalog: CLI_CATALOG,
    };
  }

  getThemeMode(): ClawDeskThemeMode {
    return this.readSettings().themeMode;
  }

  setThemeMode(themeMode: ClawDeskThemeMode): ClawDeskThemeMode {
    const current = this.readSettings();
    this.writeSettings({ ...current, themeMode });
    return themeMode;
  }

  getHotkeyConfig(): HotkeyConfig {
    const settings = this.readSettings();
    return settings.hotkeyConfig ?? { ...DEFAULT_HOTKEY_CONFIG };
  }

  setHotkeyConfig(config: HotkeyConfig): HotkeyConfig {
    const current = this.readSettings();
    this.writeSettings({ ...current, hotkeyConfig: config });
    return config;
  }

  async checkToggleWindowConflict(accelerator: string, currentAccelerator: string): Promise<HotkeyCheckResult> {
    const conflicts: HotkeyCheckResult['conflicts'] = [];

    // Basic format check: must have at least one modifier + one key
    const parts = accelerator.split('+').map((p) => p.trim()).filter(Boolean);
    const modifiers = new Set(['Command', 'Cmd', 'Ctrl', 'Control', 'Alt', 'Shift', 'CmdOrCtrl', 'CommandOrControl', 'AltGr', 'Meta', 'Super']);
    const hasModifier = parts.slice(0, -1).some((p) => modifiers.has(p));
    const hasKey = parts.length >= 1 && !modifiers.has(parts[parts.length - 1]);
    if (!hasKey || !hasModifier) {
      conflicts.push({
        type: 'invalid_format',
        message: `"${accelerator}" 格式不合法，需要至少一个修饰键（Command、Ctrl 等）加上一个普通键`,
      });
      return { conflicts, isValid: false };
    }

    // Normalize for system-reserved check
    const normalized = accelerator
      .replace(/CmdOrCtrl|CommandOrControl/g, 'Command')
      .replace(/\bCtrl\b/g, 'Control');
    if (SYSTEM_RESERVED_ACCELERATORS.has(normalized)) {
      conflicts.push({
        type: 'system_reserved',
        message: `"${accelerator}" 是 macOS 系统保留快捷键，可能无法正常注册`,
      });
    }

    // Check Electron registration — skip check if it's the one we already own
    if (accelerator !== currentAccelerator) {
      try {
        const { globalShortcut } = await import('electron');
        if (globalShortcut.isRegistered(accelerator)) {
          conflicts.push({
            type: 'already_registered',
            message: `"${accelerator}" 已被其他应用占用`,
          });
        }
      } catch {
        // Not available in renderer context — skip runtime check
      }
    }

    return { conflicts, isValid: conflicts.length === 0 };
  }

  getVersionInfo(): ClawDeskVersionInfo {
    if (this.cachedPackageInfo) return this.cachedPackageInfo.versionInfo;

    const packagePathCandidates = [
      path.join(app.getAppPath(), 'package.json'),
      path.join(process.cwd(), 'package.json'),
    ];

    let packageJson: Record<string, unknown> = {};
    for (const packagePath of packagePathCandidates) {
      try {
        const raw = fs.readFileSync(packagePath, 'utf8');
        packageJson = JSON.parse(raw) as Record<string, unknown>;
        break;
      } catch {
        continue;
      }
    }

    const scripts = (packageJson.scripts as Record<string, string> | undefined) ?? {};
    const repository = packageJson.repository;
    const githubRepo =
      typeof repository === 'string'
        ? repository
        : repository && typeof repository === 'object' && 'url' in repository
          ? String(repository.url)
          : null;

    const versionInfo: ClawDeskVersionInfo = {
      appVersion: app.getVersion(),
      packageVersion: typeof packageJson.version === 'string' ? packageJson.version : app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      platform: `${process.platform} (${process.arch})`,
      publishScriptAvailable: typeof scripts.publish === 'string',
      autoUpdateConfigured: false,
      productName: app.getName(),
      packageName: typeof packageJson.name === 'string' ? packageJson.name : 'unknown',
      githubRepo,
    };

    this.cachedPackageInfo = { versionInfo };
    return versionInfo;
  }

  getProviderSummary(): ClawDeskProviderSummaryItem[] {
    const voiceConfigured = Boolean(
      resolve('VOLCENGINE_APP_ID') &&
      resolve('VOLCENGINE_ACCESS_TOKEN') &&
      resolve('VOLCENGINE_RESOURCE_ID'),
    );
    const refinementConfigured = Boolean(
      resolve('ARK_API_KEY') && (resolve('DICTATION_REFINEMENT_ENDPOINT_ID') || resolve('DICTATION_REFINEMENT_MODEL')),
    );

    const voiceSource = isFromCredentialStore('VOLCENGINE_APP_ID') ? 'settings' : 'env';
    const textSource = isFromCredentialStore('ARK_API_KEY') ? 'settings' : 'env';

    return [
      {
        id: 'voice',
        label: '语音服务商',
        provider: 'Volcengine ASR',
        detail: voiceConfigured
          ? voiceSource === 'settings'
            ? '已通过 Settings 配置 Volcengine ASR，可用于语音输入链路。'
            : '已检测到 Volcengine ASR 配置（来自 .env），可用于语音输入链路。'
          : '尚未检测到 Volcengine ASR 的完整配置。',
        configured: voiceConfigured,
        statusLabel: voiceConfigured ? '已检测到配置' : '未检测到配置',
        envKeys: [
          'VOLCENGINE_APP_ID',
          'VOLCENGINE_ACCESS_TOKEN',
          'VOLCENGINE_RESOURCE_ID',
        ],
        envFilePath: PROJECT_ENV_PATH,
        envExamplePath: PROJECT_ENV_EXAMPLE_PATH,
        guidance: [
          '推荐通过 Settings UI 填写，保存后即时生效，无需重启。',
          '获取方式：volcengine.com → 语音技术 → 流式语音识别大模型 → 创建应用 → 获取 APP ID 和 Access Token。',
          '详细步骤请参考 README.md 中的 "Getting Volcengine Credentials" 部分。',
          '也可以在 .env 文件中配置，修改后需重启应用。',
        ],
        documentationUrl: 'https://www.volcengine.com/docs/6561/1354868',
        configSource: voiceConfigured ? voiceSource : undefined,
      },
      {
        id: 'text',
        label: '小文本处理服务商',
        provider: 'Ark Lightweight Text Model',
        detail: refinementConfigured
          ? textSource === 'settings'
            ? '已通过 Settings 配置 Ark 轻量文本整理模型。'
            : '已检测到 Ark 轻量文本整理模型配置（来自 .env）。'
          : '尚未检测到 Ark 文本整理模型的完整配置。',
        configured: refinementConfigured,
        statusLabel: refinementConfigured ? '已检测到配置' : '未检测到配置',
        envKeys: [
          'ARK_API_KEY',
          'DICTATION_REFINEMENT_ENDPOINT_ID',
        ],
        envFilePath: PROJECT_ENV_PATH,
        envExamplePath: PROJECT_ENV_EXAMPLE_PATH,
        guidance: [
          '在 Settings 中直接填写 API Key，或在 .env 中配置。',
          'Dictation refinement 默认会走这条轻量文本模型链路。',
          '修改后重启应用，新的整理模型配置会立即生效。',
        ],
        documentationUrl: 'https://www.volcengine.com/docs/82379/1517416',
        configSource: refinementConfigured ? textSource : undefined,
      },
    ];
  }

  scanSkills(): ClawDeskSkillItem[] {
    const skills: ClawDeskSkillItem[] = [];

    for (const source of SKILL_SOURCES) {
      for (const skillPath of walkSkillFiles(source.dir)) {
        const meta = readSkillMetadata(skillPath);
        skills.push({
          id: `${source.source}:${skillPath}`,
          path: skillPath,
          source: source.source,
          installed: true,
          name: meta.name,
          description: meta.description,
          commandName: meta.commandName,
          editable: meta.editable,
        });
      }
    }

    return skills.sort((a, b) => {
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      return a.name.localeCompare(b.name);
    });
  }

  getSkillDetail(skillId: string): ClawDeskSkillDetail {
    const skill = this.scanSkills().find((item) => item.id === skillId);
    if (!skill) {
      throw new Error('Skill not found.');
    }

    const content = fs.readFileSync(skill.path, 'utf8');

    return {
      ...skill,
      content,
      overview: extractOverview(content),
    };
  }

  saveSkillContent(skillId: string, content: string): ClawDeskSkillDetail {
    const skill = this.scanSkills().find((item) => item.id === skillId);
    if (!skill) {
      throw new Error('Skill not found.');
    }

    if (!skill.editable) {
      throw new Error('OpenClaw skills are read-only in the current version.');
    }

    fs.writeFileSync(skill.path, content, 'utf8');
    return this.getSkillDetail(skillId);
  }

  async detectCliTools(): Promise<ClawDeskCliToolStatus[]> {
    const statuses = await Promise.allSettled(
      CLI_CATALOG.map(async (tool) => {
        const binaryPath = await resolveBinary(tool.command);
        if (!binaryPath) {
          return {
            id: tool.id,
            installed: false,
            version: null,
            path: null,
            checkedAt: Date.now(),
          } satisfies ClawDeskCliToolStatus;
        }

        const version = await resolveVersion(binaryPath, tool.versionArgs);
        return {
          id: tool.id,
          installed: true,
          version,
          path: binaryPath,
          checkedAt: Date.now(),
        } satisfies ClawDeskCliToolStatus;
      }),
    );

    const normalized = statuses.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }

      logger.warn('CLI tool detection failed for item', {
        toolId: CLI_CATALOG[index]?.id,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });

      return {
        id: CLI_CATALOG[index].id,
        installed: false,
        version: null,
        path: null,
        checkedAt: Date.now(),
      } satisfies ClawDeskCliToolStatus;
    });

    logger.info('CLI tool detection finished', {
      installed: normalized.filter((item) => item.installed).length,
      total: normalized.length,
    });

    return normalized;
  }

  async getOpenClawStatus(): Promise<OpenClawStatus> {
    const binaryPath = await resolveBinary('openclaw');
    if (!binaryPath) {
      return { installed: false, path: null, version: null, authenticated: false };
    }

    const version = await resolveVersion(binaryPath, [['--version'], ['version']]);

    let authenticated = false;
    try {
      const { stdout } = await execFileAsync(binaryPath, ['whoami'], { timeout: 5000 });
      authenticated = stdout.trim().length > 0 && !stdout.toLowerCase().includes('not logged in');
    } catch {
      // whoami failed — assume not authenticated
    }

    return { installed: true, path: binaryPath, version, authenticated };
  }
}

export const clawDeskSettingsService = new ClawDeskSettingsService();
