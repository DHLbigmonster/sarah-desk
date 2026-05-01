# Sarah

Sarah is a macOS menu bar voice assistant.

Product line:

- Name: `Sarah`
- Tagline: `The Siri you actually wanted.`
- Package name: `sarah-desk`
- Bundle ID: `com.sarah.app`
- Installed app: `~/Applications/Sarah.app`
- GitHub repo: `DHLbigmonster/sarah-desk`

## Current Architecture

Primary runtime:

- Electron main process owns app lifecycle, tray menu, permissions, global hotkeys, ASR, text insertion, and agent execution.
- Mini Settings is the current primary UI surface.
- Floating HUD shows voice state for Dictation, Command, and Quick Ask.
- Answer overlay shows Quick Ask / Command responses.
- Sarah Debug Console is retained as a fallback/debug surface. Internal filenames and IPC names still use `clawdesk`; user-visible labels should say Sarah or Sarah Debug Console.
- OpenClaw is an external runtime dependency and should keep its name where it refers to the actual CLI or gateway.

Important files:

- `src/main.ts`
- `src/main/services/push-to-talk/voice-mode-manager.ts`
- `src/main/services/hotkey/hotkey-manager.ts`
- `src/main/services/keyboard/keyboard.service.ts`
- `src/main/services/agent/agent.service.ts`
- `src/main/services/asr/asr.service.ts`
- `src/main/services/asr/lib/apple-speech-client.ts` — Apple Speech fallback
- `src/main/services/text-input/text-input.service.ts`
- `src/main/services/config/credential-store.ts` — encrypted credential storage (safeStorage)
- `src/main/services/config/resolve-config.ts` — unified config resolution (credentialStore → .env)
- `src/main/services/permissions/first-launch.service.ts` — first-launch permission guide
- `src/shared/constants/provider-keys.ts` — shared provider key validation
- `.env.example` — public env template; keep hotkey/provider comments aligned with current Sarah modes
- `src/main/windows/floating.ts`
- `src/main/windows/agent.ts`
- `src/main/windows/mini-settings.ts`
- `src/renderer/mini-settings/index.ts`
- `src/renderer/src/modules/agent/AgentWindow.tsx`
- `src/renderer/src/modules/asr/components/FloatingWindow.tsx`
- `scripts/verify-mini-integration.ts`
- `scripts/install.sh` — one-liner install script for end users (curl | bash)

## Voice Modes

Dictation:

- Triggered by the configured dictation hotkey.
- Starts ASR, refines transcript, inserts text into the focused app.
- Does not open the answer overlay.

Command:

- Records voice instruction.
- Captures lightweight context.
- Routes through the agent path.
- Stores result for the tray unread state and answer overlay.

Quick Ask:

- Triggered by the configured quick ask chord.
- All questions go directly to OpenClaw (no lightweight model diversion).
- Shows response in the agent window.

## Hotkey Behavior

The voice trigger key is **user-configurable** via Settings → Hotkeys. Default is Right Ctrl. Supported keys: Right Ctrl, Right Alt, CapsLock, Right Cmd, F1–F12, or custom keycode. The three-mode pattern is always the same — only the base key changes.

- Trigger key (hold): Dictation — record, STT, polish, insert text
- Trigger key + Shift (hold): Command — record, STT, OpenClaw agent execution
- Trigger key + Space (hold): Quick Ask — record, STT, OpenClaw direct Q&A
- Control+Space: Quick Ask fallback (Electron globalShortcut, may conflict with macOS input-source switching)
- Cmd+Shift+Space: Screenshot agent panel

Trigger key / +Shift / +Space require macOS Accessibility + Input Monitoring (uiohook). Control+Space is a fallback that works without Accessibility. Config lives in `clawDeskSettingsService` (persisted) and is resolved via `resolveTriggerKeycode()` in `clawdesk-settings.ts`.

## ASR Backends

- **Primary**: Volcengine streaming ASR via WebSocket (`wss://openspeech.bytedance.com/api/v3/sauc/bigmodel`). 16kHz mono PCM, gzip-compressed, real-time streaming.
- **Fallback**: Apple Speech (`SFSpeechRecognizer` via `scripts/apple-speech-helper.swift`). Local, offline, free. Used when Volcengine credentials are not configured.
- Selection is automatic in `asr.service.ts` — `loadASRConfig()` throws `ConfigurationError` if credentials missing, ASR service catches and falls back to Apple Speech.
- Apple Speech buffers all audio until `finishAudio()`, then spawns the Swift helper process for batch recognition.

## Credential Store

- `credential-store.ts` — stores credentials in `userData/credentials.json`, encrypted via `safeStorage.encryptString()`.
- `resolve-config.ts` — unified resolution: credentialStore (GUI-written) → process.env (.env fallback).
- All config-consuming services use `resolve(key)` from `resolve-config.ts`.
- `provider-keys.ts` — shared constant list of valid provider keys + `isValidProviderKey()` for IPC validation.

## AgentService Task Queue

- Quick Ask and Command share a single AgentService instance.
- If one task is running when another starts, the new task is queued (not aborted).
- The queued task executes automatically when the running task finishes.
- User-initiated abort (ESC/close) clears the queue.

## Context Capture & Skill Decision Tree

- Command mode captures context in `startCommandMode()` (before agent window appears), not in `stopCommand()`. This ensures the frontmost app is the user's app, not CodePilot.
- `agent.service.ts` buildPrompt() includes a decision tree for skill selection:
  - Browser (Chrome/Safari/Edge) → web-access skill (CDP, preserves login state)
  - Lark/Feishu → lark-doc / lark-im (direct CLI, no web scraping needed)
  - Other apps (WeChat, Notes, etc.) → screenshot analysis (no URL available)
  - No URL + no screenshot → ask user for content
- web-access skill is installed as a direct copy in `~/.openclaw/skills/web-access/` (not a symlink — OpenClaw rejects symlinks with "symlink-escape" error).

## Known Decisions

- `OpenClaw` remains named because it is the actual external CLI/runtime.
- Internal `clawdesk` module names remain for now to avoid broad low-value churn.
- Sarah Debug Console should stay hidden on default startup.
- If the debug console stops being useful, remove `src/renderer/clawdesk/**`, `src/main/windows/claw-desk.ts`, and related IPC in one focused cleanup.
- The native macOS tray menu cannot support a custom high-end visual style; a custom menubar popover is the correct next UI direction.

## Signing & Packaging

- Signed with a real Apple Development cert from login keychain (not adhoc). Override with `CODESIGN_IDENTITY` env var.
- TCC grants persist across reinstalls as long as the signing identity stays the same.
- First install after switching from adhoc → real identity requires re-granting Accessibility / Input Monitoring once.
- Install via `scripts/install-packaged-app.sh` (rsync strips xattrs, signs inside-out, root bundle last with `--identifier com.sarah.app`).
- Never unconditionally `tccutil reset` — only reset when signing identity actually changed (tracked via `.last-install-authority`).
- Never unconditionally push Input Monitoring into missing-permissions list — if Accessibility is granted, assume Input Monitoring is too.
- Install script cleans up build output (`out/Sarah-darwin-arm64/`) after install to prevent Dock duplicate icons.
- Only supported install path: `pnpm run install:app`. Direct `pnpm run package` produces unsigned app.
- `pnpm verify:mini` expects `out/Sarah-darwin-arm64/Sarah.app`; run `pnpm run package` immediately before verification, because `pnpm run install:app` removes that output after install.

## CI/CD

- `.github/workflows/ci.yml` — runs on PR/push to main: typecheck, lint, test, verify:mini.
- `.github/workflows/release.yml` — runs on tag push (`v*`): builds macOS arm64 ZIP, creates draft GitHub Release. No lint/typecheck (CI already covers that).

## Verification Baseline

Known-good local verification (2026-04-29):

- `pnpm -s typecheck`
- `pnpm -s lint`
- `pnpm -s test`
- `pnpm -s verify:mini`
- `pnpm run install:app`

Packaged verification confirmed:

- `~/Applications/Sarah.app`
- `CFBundleDisplayName = Sarah`
- `CFBundleIdentifier = com.sarah.app`

## Open Items

- If custom dictionary data exists, migrate it from the old config directory to `~/.config/sarah-desk/dictionary.json`.
- Consider renaming the local folder to `sarah-desk` after active shells and editor sessions are closed.
- Next UI work: custom menubar popover, clearer first-run permission flow.
- Hotword table and correction table support are wired but require Volcengine console setup to activate.

## 2026-04-29 Knowledge Sync

- Ran `neat-freak` cleanup against project root markdown, `.env.example`, Trellis workflow, and current code.
- Restored the Trellis managed block in `AGENTS.md`; architecture truth remains in `CLAUDE.md`.
- Updated `.env.example` from stale Mode 1/2/3 wording to current Dictation / Command / Quick Ask behavior.
- Aligned startup missing-permission logic with the packaging decision: Input Monitoring is only included in the missing list when Accessibility is also missing.
- Updated `README.md` to mention the Ctrl+Space Quick Ask fallback and the `pnpm run package` → `pnpm verify:mini` ordering.

## 2026-04-29 UI Redesign

All three UI surfaces received a visual overhaul in commit `07efe9b`:

**Floating HUD capsule:**
- Window 184x48 → 150x40, button 32→28px, wave area 90→72px, icon 18→15px.
- Waveform RMS amplification 22→34 (+55% sensitivity), animation interval 72→55ms.
- Shadow weight reduced ~30%.

**Answer overlay:**
- Width 620→560px, fixed height → min-height 240 / max-height 70vh (auto-fit).
- Markdown rendering via `react-markdown` + `remark-gfm` (replaces plain `<pre>`).
- Code block copy button (hover to reveal, copies block content).
- Retry button on question area after answer completes.
- "OpenClaw" user-visible text → "正在思考…".
- Footer hidden by default, fades in on hover.

**Mini Settings (Control Center):**
- Window 460x520 → 380x380, background #f3f3ee (beige) → dark glass style.
- 54px signal circle → 8px status dot.
- 2x2 settings card grid replacing hero-style status blocks.
- Auto-refresh on focus + every 10s interval.
- "Open Settings" button to launch full ClawDesk settings window.

Design language is now unified: dark semi-transparent glass across all three surfaces.

## 2026-04-29 User-Configurable Hotkey

The voice trigger key (previously hardcoded to Right Ctrl) is now user-configurable:

- **Type expansion**: `VoiceTriggerKey` in `clawdesk-settings.ts` now includes CapsLock, MetaRight, F1–F12, and custom keycode.
- **Startup flow**: `main.ts` calls `hotkeyManager.init()` which reads persisted `HotkeyConfig` and passes it to `voiceModeManager.initialize(config)`. No more bare `voiceModeManager.initialize()` calls.
- **Pseudo-modifier for non-standard keys**: `KeyboardService` tracks a `'trigger'` pseudo-modifier via `setTriggerKeycode()` so CapsLock/F-keys/MetaRight can participate in Space chords (Quick Ask).
- **Settings UI**: `HotkeysSection` shows a grid of all safe trigger keys. `isDirty` check covers `voiceTriggerKey`, `customKeycode`, and `toggleWindow`.
- **Mini settings**: Hotkey hint is now dynamic (computed from `hotkeyConfig`), not hardcoded "Right Ctrl · Ctrl+Space".
- **HotkeyManager.apply()**: `voiceTriggerChanged` compares both `voiceTriggerKey` and `customKeycode` to detect changes when the user switches between custom keycodes.

## 2026-05-01 Pre-UI-Optimization Save

User asked to optimize the current project UI with GPT image generation support, but first save the current project state to GitHub.

- Created a preservation point before any UI optimization work.
- Current working tree already contained broad changes: removal of the old `src/renderer/clawdesk/**` surface and `vite.clawdesk.config.ts`, updates around mini settings, ASR, push-to-talk, IPC/preload types, and new marketing notes.
- Decision: keep all existing local changes intact and save them as-is before discussing or implementing the next UI direction.
- No UI optimization has been started in this entry.

Next steps:

- Discuss target UI direction for Sarah: menubar popover, mini settings, floating HUD, answer overlay, or marketing surfaces.
- Before editing UI code, read the specific Trellis frontend guidelines for window lifecycle, IPC, component structure, React pitfalls, and type safety.
- Use generated raster visuals only where they improve the actual product surface; keep app controls dense, clear, and native-feeling.
