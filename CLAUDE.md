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
- `~/Applications/Sarah.app`
- `CFBundleDisplayName = Sarah`
- `CFBundleExecutable = Sarah`
- `CFBundleIdentifier = com.sarah.app`
- `CFBundleName = Sarah`

## Open Items

- Sarah is now signed with a real codesigning identity from the login keychain (Apple Development cert by default; override with `CODESIGN_IDENTITY`). TCC grants persist across reinstalls as long as the identity stays the same.
- One-time migration: the first install after switching from adhoc to a real identity still requires re-granting Accessibility / Input Monitoring (TCC sees the new signature as a different app). Subsequent reinstalls keep the grant.
- If custom dictionary data exists, migrate it from the old config directory to `~/.config/sarah-desk/dictionary.json`.
- Consider renaming the local folder to `sarah-desk` after active shells and editor sessions are closed.
- Next UI work should prioritize a custom menubar popover, markdown rendering in answer overlay, and a clearer first-run permission flow.

## 2026-04-28 Hotkey Permission Recovery

User request:

- After reinstalling Sarah, Right Control, Right Control + Shift, and Right Control + Space all stopped working.

What changed:

- Confirmed from `~/Library/Logs/Sarah/main.log` that Sarah was starting with `hasAccessibility: false`, so uiohook keyboard hooks were intentionally skipped to avoid native crashes.
- `src/main/services/push-to-talk/voice-mode-manager.ts`
  - Split `initializeQuickAskShortcut()` out from full uiohook initialization.
  - `Control+Space` now registers through Electron `globalShortcut` even when Accessibility is missing and right-Control hooks cannot start.
  - `dispose()` unregisters the Quick Ask fallback even if only that fallback was initialized.
- `src/main.ts`
  - When Accessibility is missing, Sarah now opens both keyboard permission panes and still initializes the Quick Ask fallback.
- `src/main/services/permissions/permissions.service.ts`
  - Added `openKeyboardPermissionSettings()` and made the notification explain that Sarah must be enabled in both Accessibility and Input Monitoring, then restarted.
- `scripts/install-packaged-app.sh`
  - Avoids a second install-time ad-hoc re-sign after copying the packaged app, reducing avoidable TCC identity churn.

Decision:

- Right Control and Right Control + Shift still require macOS Accessibility/Input Monitoring because they depend on uiohook. `Control+Space` can fall back to Electron globalShortcut, but may still fail if macOS reserves that chord for input-source switching.

Next steps:

- After installing, re-enable `~/Applications/Sarah.app` in Accessibility and Input Monitoring, then restart Sarah.
- Longer term, replace ad-hoc signing with a stable local/developer signing identity so package reinstallations do not keep invalidating TCC grants.

## 2026-04-28 Stop TCC Re-prompting (Stable Codesigning)

Problem:

- Every `npm run install:app` invalidated Accessibility / Input Monitoring grants. Sarah kept booting with `hasAccessibility: false` and macOS popped the same authorization dialog again.

Root cause:

- `forge.config.ts` postPackage hook signed with `codesign --sign -` (adhoc). Adhoc TCC entries are keyed by the executable's CDHash, which changes on every rebuild, so each install looked like a brand-new app.

What changed:

- `forge.config.ts`
  - postPackage now picks a real signing identity. Order: `CODESIGN_IDENTITY` env var → first identity from `security find-identity -v -p codesigning` → adhoc fallback (warns).
  - The auto-detected identity comes from `security find-identity -v -p codesigning`. Set `CODESIGN_IDENTITY` env var to override.
- `scripts/install-packaged-app.sh`
  - After install, runs `codesign -dvvv` and warns if the binary is still adhoc; otherwise prints which `Authority=` line signed it.

Decision:

- Apple Development cert is the lowest-friction option since the user already has one in the login keychain. It's tied to this machine and expires annually, but TCC tracks by team identifier + bundle ID, so reinstalls keep the grant as long as the cert is valid. If it expires, redo permissions once and continue.

Migration step required by user:

- After the first install with the new signature, macOS treats Sarah as a new app. Re-grant once in Accessibility and Input Monitoring. After that, future reinstalls keep the grant.

Verification:

- `pnpm -s package` produced a valid signature with a real `Authority=Apple Development: ...` identity (was `Signature=adhoc`, `TeamIdentifier=not set`).
- `pnpm -s typecheck` / `pnpm -s lint` / `pnpm -s test` (36/36 passed).

Verification:

- `pnpm -s typecheck`
- `pnpm -s lint`
- `pnpm -s test` passed with 49 tests.
- `pnpm -s verify:mini` passed 68/68 packaged checks.
- `npm run install:app` completed after cleaning stale `out/Sarah-darwin-arm64` before packaging.

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
