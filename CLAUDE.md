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
- `src/main/services/agent/agent.service.ts`
- `src/main/services/agent/intent-router.service.ts`
- `src/main/services/asr/asr.service.ts`
- `src/main/services/text-input/text-input.service.ts`
- `src/main/windows/floating.ts`
- `src/main/windows/agent.ts`
- `src/main/windows/mini-settings.ts`
- `src/renderer/mini-settings/index.ts`
- `src/renderer/src/modules/agent/AgentWindow.tsx`
- `src/renderer/src/modules/asr/components/FloatingWindow.tsx`
- `scripts/verify-mini-integration.ts`

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
- Routes simple questions through the lightweight quick-answer path.
- Falls back to OpenClaw when tools or multi-step work are required.

## Known Decisions

- `OpenClaw` remains named because it is the actual external CLI/runtime.
- Internal `clawdesk` module names remain for now to avoid broad low-value churn.
- Sarah Debug Console should stay hidden on default startup.
- If the debug console stops being useful, remove `src/renderer/clawdesk/**`, `src/main/windows/claw-desk.ts`, and related IPC in one focused cleanup.
- The native macOS tray menu cannot support a custom high-end visual style; a custom menubar popover is the correct next UI direction.

## Verification Baseline

Known-good local verification from 2026-04-28:

- `pnpm -s typecheck`
- `pnpm -s lint`
- `pnpm -s test`
- `pnpm -s verify:mini`
- `npm run install:app`

Packaged verification confirmed:

- `out/Sarah-darwin-arm64/Sarah.app`
- `/Users/chaosmac/Applications/Sarah.app`
- `CFBundleDisplayName = Sarah`
- `CFBundleExecutable = Sarah`
- `CFBundleIdentifier = com.sarah.app`
- `CFBundleName = Sarah`

## Open Items

- Re-grant macOS permissions for `com.sarah.app`: microphone, input monitoring, accessibility.
- If custom dictionary data exists, migrate it from the old config directory to `~/.config/sarah-desk/dictionary.json`.
- Consider renaming the local folder to `sarah-desk` after active shells and editor sessions are closed.
- Next UI work should prioritize a custom menubar popover, markdown rendering in answer overlay, and a clearer first-run permission flow.

## 2026-04-28 Quick Ask Control+Space Fix

User request:

- Right Control + Space did not trigger Quick Ask, while Right Control + Shift command mode worked.

What changed:

- `src/main/services/push-to-talk/voice-mode-manager.ts`
  - Added an Electron `globalShortcut.register('Control+Space', ...)` fallback for Quick Ask.
  - Kept the existing uiohook `RightCtrl + Space` path.
  - Both paths now route through one Quick Ask toggle helper.
  - Dispose unregisters the Electron shortcut.
- `src/main/services/keyboard/keyboard.service.ts`
  - Added focused logging for Space keydown when Right Ctrl or Alt is held, so future logs show whether the low-level hook receives the chord.
- `src/main/services/push-to-talk/voice-mode-manager.test.ts`
  - Added coverage that the global shortcut fallback starts Quick Ask and cancels the pending bare Right Ctrl handler.

Decision:

- macOS may reserve or swallow `Control+Space` for input-source switching. The Electron global shortcut fallback makes this path explicit: if registration fails, Sarah logs `Failed to register Control+Space global shortcut for Quick Ask`.

Verification:

- `pnpm -s typecheck`
- `pnpm -s lint`
- `pnpm -s test` passed with 47 tests.
- `git diff --check`
