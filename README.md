# Sarah

> The Siri you actually wanted.

Sarah is a macOS menu bar voice assistant built with Electron. It listens to your voice through a global hotkey, converts speech to text in real time, and either inserts the text at your cursor or hands it off to an AI agent that can operate your apps — all without leaving the keyboard.

## What It Does

Sarah operates in three modes, each triggered by a keyboard chord:

| Mode | Hotkey | What Happens |
|------|--------|--------------|
| **Dictation** | Press trigger key (default: Right Ctrl) once to start, once to stop | Speak → text appears at cursor in any app |
| **Command** | Press trigger key + Shift once to start, once to stop | Speak → AI agent executes your instruction (open apps, search the web, write to Feishu, etc.) |
| **Quick Ask** | Press trigger key + Space once to start, once to stop | Speak → AI answers your question in an overlay panel |

The trigger key is fully customizable: Right Ctrl, Right Alt, CapsLock, Right Cmd, F1–F12, or any custom keycode. Configure it in **Settings → Hotkeys**.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Sarah (Electron)                         │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│  Input Layer │  Speech Layer│ Refinement   │  Action Layer      │
│              │              │  Layer       │                    │
│  Global      │  Volcengine  │  Ark lite    │  Dictation:        │
│  hotkeys     │  streaming   │  text clean  │   text insertion   │
│  (uiohook)   │  ASR (WS)    │  (optional)  │  Command:          │
│              │              │              │   OpenClaw agent   │
│  Context     │  Apple Speech│              │  Quick Ask:        │
│  capture     │  fallback    │              │   OpenClaw Q&A     │
│  (screenshot │  (local,     │              │                    │
│   + app info)│   offline)   │              │                    │
├──────────────┴──────────────┴──────────────┴────────────────────┤
│  Config Layer: credential-store (safeStorage) → .env fallback   │
└─────────────────────────────────────────────────────────────────┘
```

**Speech-to-Text**: Sarah connects to Volcengine's streaming ASR service via WebSocket. Audio is captured at 16 kHz mono PCM, gzip-compressed, and streamed in real time. If no Volcengine credentials are configured, it automatically falls back to Apple Speech (built into macOS, works offline, zero configuration).

**Refinement**: After transcription, an optional LLM pass (Volcengine Ark) cleans up the text — fixing punctuation, removing filler words, and restructuring for clarity. This is transparent to the user.

**Agent Execution**: In Command and Quick Ask modes, the transcribed text is handed to [OpenClaw](https://github.com/openclaw), an external AI agent runtime. Sarah spawns it as a subprocess with rich context (current app, window title, screenshot, URL) so the agent can make informed decisions. OpenClaw has access to skills like `web-browser` (CDP-based web scraping with login state), `lark-doc`, `lark-im`, and others.

**Context Capture**: When you press the hotkey for Command mode, Sarah captures a screenshot and metadata of your current app *before* its own window appears. This means the agent sees what you were looking at, not the Sarah interface.

## Installation

### One-Line Install (Recommended)

```bash
curl -sSL https://raw.githubusercontent.com/DHLbigmonster/sarah-desk/main/scripts/install.sh | bash
```

This downloads the latest release, extracts it, and installs Sarah to `/Applications`. Takes about 10 seconds.

> **Note**: The app is not code-signed. On first launch, right-click Sarah in Applications and select **Open** to bypass Gatekeeper. Then grant Microphone, Input Monitoring, and Accessibility permissions when prompted.

### Quick Start (Zero Config)

**No registration, no API keys, no Chinese phone number.** Sarah uses Apple Speech for voice recognition out of the box. Want better accuracy? Connect Volcengine ASR in Settings.

### Manual Download

Go to [**GitHub Releases**](https://github.com/DHLbigmonster/sarah-desk/releases), download the `.zip` for your architecture (arm64 for Apple Silicon, x64 for Intel), extract it, and drag `Sarah.app` to your Applications folder.

### Prerequisites

| Requirement | For |
|-------------|-----|
| **macOS 12+** | Required (runtime) |
| **Node.js 18+** | Building from source only |
| **pnpm** | Building from source only (`npm install -g pnpm`) |

If you use the one-line install or download from Releases, you only need macOS 12+.

### Development Mode

```bash
git clone https://github.com/DHLbigmonster/sarah-desk.git
cd sarah-desk
pnpm install
pnpm start
```

On first launch, macOS will prompt you to grant three permissions:

1. **Microphone** — voice capture
2. **Input Monitoring** — global keyboard hooks (push-to-talk hotkeys)
3. **Accessibility** — text insertion into other apps

Grant all three. Press **Right Ctrl** once to start speaking, press again to stop — text appears at your cursor.

### Building a Standalone App

To build and install Sarah as a standalone macOS app:

```bash
pnpm run install:app
```

This command:
1. Packages the Electron app into `out/Sarah-darwin-arm64/Sarah.app`
2. Copies it to `~/Applications/Sarah.app`
3. Signs it with your Apple Development certificate (TCC permissions persist across reinstalls)
4. Cleans up the build output to prevent duplicate Dock icons

After installation, launch Sarah from your Applications folder or Spotlight. The development server is no longer needed.

> **Note**: `pnpm run install:app` is the only supported install path. Running `pnpm run package` alone produces an unsigned app in `out/` — it will not have proper permissions and will lose TCC grants on every launch.

## Configuration

### Volcengine ASR (Optional — Better Accuracy)

Volcengine ASR provides significantly better Chinese recognition than Apple Speech. To set it up:

1. **Register** at [volcengine.com](https://www.volcengine.com/)
2. Navigate to **全部产品 → 语音技术 → 流式语音识别大模型**
3. Click **立即开通** (free for basic tier)
4. **Create an application** and note the **APP ID**
5. Click the eye icon to reveal and copy the **Access Token**

Enter credentials in Sarah via either method:

- **Settings UI**: Open Sarah Settings → Models → click the voice provider card → fill in APP_ID and ACCESS_TOKEN → Save
- **`.env` file**: Copy `.env.example` to `.env` and fill in the values. Sarah reads from the credential store first, then falls back to `.env`.

### Text Refinement (Optional)

For cleaner dictation output (punctuation, grammar), configure an Ark model:

1. Go to [火山方舟 (Ark)](https://www.volcengine.com/product/ark)
2. Create a text generation endpoint (e.g., Doubao Lite)
3. Set `ARK_API_KEY` and `DICTATION_REFINEMENT_ENDPOINT_ID` in Settings or `.env`

### OpenClaw (Required for Command / Quick Ask)

Sarah depends on the `openclaw` CLI for AI agent capabilities. **Dictation works without OpenClaw.**

```bash
# Install
brew install openclaw
# or
npm install -g openclaw

# Authenticate
openclaw login

# Verify
openclaw --version
```

See the [OpenClaw documentation](https://github.com/openclaw) for details.

## macOS Permissions

| Permission | Purpose | Grant via |
|------------|---------|-----------|
| **Microphone** | Voice capture | System Settings → Privacy & Security → Microphone |
| **Input Monitoring** | Global keyboard hooks | System Settings → Privacy & Security → Input Monitoring |
| **Accessibility** | Text insertion into other apps | System Settings → Privacy & Security → Accessibility |

Sarah shows a notification if any permission is missing. Click it to open System Settings directly.

With stable Apple Development signing, permissions persist across reinstalls. The first install after switching signing identities requires a one-time re-grant.

## Project Structure

```
src/main/                        Electron main process
  services/agent/                OpenClaw agent integration
  services/asr/                  Speech-to-text (Volcengine + Apple Speech)
  services/config/               Credential store, config resolution
  services/keyboard/             Global hotkey handling (uiohook)
  services/push-to-talk/         Voice mode state machine
  services/text-input/           Cursor text insertion
  windows/                       Window managers (floating HUD, agent overlay, settings)
src/renderer/
  mini-settings/                 Menu bar control center
  clawdesk/pages/settings/       Full settings UI
  src/modules/agent/             Agent overlay panel
  src/modules/asr/               Floating voice HUD
src/shared/                      IPC constants and type definitions
scripts/                         Packaging, install, verification scripts
```

## Development

```bash
pnpm start              # Launch in dev mode (hot reload)
pnpm typecheck          # Type checking
pnpm lint               # Linting
pnpm test               # Run tests
```

### Verification

```bash
pnpm run package        # Build the packaged app
pnpm verify:mini        # Smoke test the packaged app
```

Checks source wiring, packaged app contents, native modules, and runs a packaged smoke test. Run verification after `pnpm run package` and before `pnpm run install:app` (install removes the build output).

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **"openclaw CLI 未找到"** | Install OpenClaw and ensure `openclaw` is on your PATH. Run `which openclaw` to verify. |
| **"OpenClaw 未登录或鉴权失败"** | Run `openclaw login` in your terminal. |
| **No audio / ASR errors** | Check `VOLCENGINE_APP_ID` and `VOLCENGINE_ACCESS_TOKEN` in Settings or `.env`. |
| **Hotkeys not working** | Grant Accessibility + Input Monitoring in System Settings. Change trigger key in Settings → Hotkeys. |
| **Text not inserting** | Grant Accessibility permission. |
| **Dictation not working without config** | Grant Microphone permission. Apple Speech is used as fallback. |
| **"macOS cannot verify the developer"** | Right-click (or Control-click) the app → Open. This only needs to be done once. Alternatively: System Settings → Privacy & Security → click "Open Anyway". |

## CI/CD

- **`ci.yml`**: Runs on PR/push to main — typecheck, lint, test, verify:mini
- **`release.yml`**: Runs on tag push (`v*`) — builds macOS arm64 ZIP, creates draft GitHub Release

To create a release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions will build and create a draft release. Review and publish it from the [Releases](https://github.com/DHLbigmonster/sarah-desk/releases) page.

## License

MIT
