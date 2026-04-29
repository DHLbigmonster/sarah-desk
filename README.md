# Sarah

> The Siri you actually wanted.

Sarah is a macOS menu bar voice assistant. Talk to it — it dictates into the focused app, answers questions, or executes agent workflows on your desktop.

## Features

- **Mode 1 — Push-to-Talk Dictation**: Hold Right Option, speak, release. Text is inserted at the cursor in any app.
- **Mode 2 — Voice Agent**: Hold Right Ctrl, speak, release. Your voice becomes an instruction to an AI agent that can operate your apps.
- **Mode 3 — Screenshot Agent**: Press Cmd+Shift+Space. Sarah screenshots the current window and opens an agent panel for context-aware commands.
- **Menu Bar Control Center**: Runtime status, diagnostics, settings.

## Quick Start (Mode 1 — Zero Config)

If you only want **push-to-talk dictation** (Mode 1), you can skip Volcengine and Open Claw entirely. Sarah will use **Apple Speech** (built into macOS 12+) as a local fallback.

```bash
git clone https://github.com/DHLbigmonster/sarah-desk.git
cd sarah-desk
npm install
npm start
```

Grant **Microphone**, **Input Monitoring**, and **Accessibility** permissions when prompted. Hold Right Option, speak, release — text appears at the cursor.

> Note: Apple Speech is local and offline, but may be less accurate than Volcengine ASR for complex Chinese speech. For best results, configure Volcengine (see below).

## Prerequisites

| Requirement | Why |
|-------------|-----|
| **macOS 12+** | Electron + native APIs |
| **Node.js 18+** | Build toolchain |
| **Volcengine ASR credentials** | Speech-to-text for voice input (optional for Mode 1) |
| **Open Claw CLI** | Agent backend for Mode 2/3 (not needed for Mode 1) |
| **macOS permissions** | Microphone, Input Monitoring, Accessibility (see below) |

## Getting Volcengine Credentials (Recommended)

Volcengine ASR provides higher accuracy than the Apple Speech fallback, especially for Chinese. Follow these steps:

### Step 1: Register a Volcengine Account

1. Go to [volcengine.com](https://www.volcengine.com/) and click **注册** (Register)
2. Complete phone/email verification
3. Log in to the Volcengine Console

### Step 2: Enable Speech Recognition Service

1. In the console, navigate to **全部产品 → 语音技术** (or search "语音技术")
2. Click **流式语音识别大模型** (Streaming Large Model Speech Recognition)
3. Click **立即开通** (Enable Now) — this is free for the basic tier

### Step 3: Create an Application

1. On the 流式语音识别大模型 page, click **创建应用** (Create Application)
2. Fill in:
   - **应用名称** (App Name): anything, e.g. "Sarah"
   - **描述** (Description): optional
3. Click **确定** (Confirm)
4. Note the **APP ID** displayed on the application list (e.g., `4120356295`)

### Step 4: Get Access Token

1. Click on your newly created application to enter its detail page
2. Click the **眼睛 icon** (eye icon) next to **Access Token** to reveal it
3. Copy and save the Access Token

### Step 5: Note the Resource ID

The default Resource ID is `volc.bigasr.sauc.duration`. You generally don't need to change this unless you want a different model tier.

### Step 6 (Optional): Configure Hot Word Table

If you have domain-specific terms (e.g., product names), you can create a hot word table in the Volcengine console to improve recognition accuracy.

### Step 7 (Optional): Set Up Text Refinement

For better dictation quality (punctuation, grammar cleanup), configure an Ark model:

1. Go to [火山方舟 (Ark)](https://www.volcengine.com/product/ark)
2. Create a text generation endpoint (e.g., Doubao Lite)
3. Note your **API Key** and **Endpoint ID**

### Enter Credentials in Sarah

You can either:
- **Via Settings UI**: Open Sarah Settings → Models → click the voice provider card → fill in APP_ID and ACCESS_TOKEN → Save
- **Via .env file**: Copy `.env.example` to `.env` and fill in the values

## Installing Open Claw (For Mode 2/3 Only)

Sarah depends on the `openclaw` CLI for AI agent capabilities (Mode 2 voice agent, Mode 3 screenshot agent). **Mode 1 (dictation) works without Open Claw.**

### What is Open Claw?

Open Claw is a CLI-based AI agent runtime. Sarah spawns it as a subprocess to handle voice commands and screenshot-based workflows.

### Installation

```bash
# Install via Homebrew (recommended)
brew install openclaw

# Or install via npm
npm install -g openclaw
```

### Verify Installation

```bash
which openclaw
openclaw --version
```

### Authenticate

```bash
openclaw login
```

Follow the prompts to authenticate. This is required for Mode 2/3 to work.

### Troubleshooting

**`openclaw` not found after install:**
- Ensure Homebrew's bin directory is on your PATH: `export PATH="/opt/homebrew/bin:$PATH"`
- Or run `which openclaw` to find where it was installed

**Authentication fails:**
- Run `openclaw login` again and check your credentials
- Ensure you have an active Open Claw account

## Configuration

Edit the `.env` file with your credentials:

```bash
# Required: Volcengine ASR (speech-to-text)
VOLCENGINE_APP_ID=your_app_id
VOLCENGINE_ACCESS_TOKEN=your_access_token

# Optional: Text refinement model (improves dictation quality)
ARK_API_KEY=your_ark_api_key
DICTATION_REFINEMENT_ENDPOINT_ID=ep-xxxxxxxxxxxxxxxx

# Optional: Hotkey customization
AGENT_VOICE_KEY=CtrlRight          # Key for Mode 2 (voice agent)
AGENT_HOTKEY=CommandOrControl+Shift+Space  # Key for Mode 3 (screenshot agent)
```

See `.env.example` for the full list of options including proxy settings, hot word tables, and refinement parameters.

## macOS Permissions

Sarah requires three macOS permissions. You will be prompted automatically on first launch:

| Permission | What it's for | How to grant |
|------------|--------------|--------------|
| **Microphone** | Voice capture | System Settings → Privacy & Security → Microphone → enable Sarah |
| **Input Monitoring** | Global keyboard hooks (push-to-talk hotkeys) | System Settings → Privacy & Security → Input Monitoring → enable Sarah |
| **Accessibility** | Text insertion into other apps | System Settings → Privacy & Security → Accessibility → enable Sarah |

> If permissions are missing, Sarah will show a notification. Click it to open System Settings directly.

## Development

```bash
npm start              # Launch in development mode
npm run typecheck      # Type checking
npm run lint           # Linting
npm test               # Run tests
```

## Package and Install

```bash
npm run install:app
```

This builds and installs the app to:

```
~/Applications/Sarah.app
```

Bundle identifier: `com.sarah.app`

After installing a new bundle, macOS may require fresh permissions for microphone, input monitoring, and accessibility.

## Verification

```bash
npm run verify:mini
```

Checks source wiring, packaged app contents, native modules, and runs a packaged smoke test.

## Project Structure

```
src/main/                  Electron main process, services, IPC, windows
src/renderer/mini-settings Mini control center renderer
src/renderer/src/modules   Floating HUD and answer overlay renderers
src/shared                 Shared IPC constants and types
scripts/                   Packaging, launch, and integration verification scripts
```

## How It Works

```
┌──────────────┐    voice     ┌──────────────┐    spawn     ┌──────────────┐
│   Microphone │ ──────────→ │  Volcengine  │ ──────────→ │   Sarah      │
│   (input)    │             │  ASR (STT)   │             │  (Electron)  │
└──────────────┘             └──────────────┘             └──────┬───────┘
                                                                 │
                                              ┌──────────────────┼──────────────────┐
                                              │                  │                  │
                                         Mode 1            Mode 2             Mode 3
                                     insert text     ┌──────────────┐    screenshot +
                                                     │  Open Claw   │    agent panel
                                                     │  CLI agent   │
                                                     └──────────────┘
```

**ASR Backend**: Sarah connects to Volcengine's streaming ASR service via WebSocket (`wss://openspeech.bytedance.com/api/v3/sauc/bigmodel`). Audio is captured at 16kHz mono PCM, gzip-compressed, and streamed in real-time. If Volcengine credentials are not configured, Mode 1 falls back to Apple Speech (local, offline).

## Troubleshooting

**"openclaw CLI 未找到"**
→ Install Open Claw and ensure `openclaw` is on your PATH. Run `which openclaw` to verify.

**"OpenClaw 未登录或鉴权失败"**
→ Run `openclaw login` in your terminal to authenticate.

**No audio / ASR errors**
→ Check your `VOLCENGINE_APP_ID` and `VOLCENGINE_ACCESS_TOKEN` in `.env` or Settings UI. Verify your Volcengine account is active.

**Hotkeys not working**
→ Ensure Input Monitoring permission is granted in System Settings → Privacy & Security.

**Text not inserting**
→ Ensure Accessibility permission is granted. Sarah uses native APIs to insert text into the focused app.

**Mode 1 not working without configuration**
→ Ensure Microphone permission is granted. Sarah uses Apple Speech as a local fallback when Volcengine is not configured.

## License

MIT
