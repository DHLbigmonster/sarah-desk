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

## 2026-05-01 Menubar Popover UI

User approved optimizing the menubar popover first.

- Added a custom `MenubarPopoverWindowManager` in `src/main/windows/menubar-popover.ts`.
- Added Forge/Vite renderer target `menubar_popover_window` plus `menubar-popover.html`.
- Tray left-click now opens the custom Sarah popover unless there is an unread Command result; right-click still opens the native diagnostic context menu.
- Popover renderer lives in `src/renderer/menubar-popover/` and uses a compact macOS-style surface: status hero, Dictate/Command actions, permission repair strip, runtime status rows, Logs/Refresh/Quit footer.
- Reused existing Mini status data instead of creating a separate status model.
- Added Mini IPC actions for hiding the popover, opening settings, opening permissions, toggling Dictation/Command, and quitting.
- Added `src/types/lucide-react-icons.d.ts` so direct per-icon lucide ESM imports stay typeable without pulling the full lucide root module into the popover bundle.
- Extended `scripts/verify-mini-integration.ts` to cover the new popover entry, window manager, packaged path, and Forge target.

Verification:

- `CI=true pnpm -s verify:mini` passed 61/61 checks.
- `./node_modules/.bin/esbuild src/renderer/menubar-popover/index.tsx --bundle --format=esm --platform=browser --outfile=/tmp/sarah-menubar-popover.js --loader:.css=empty --loader:.woff2=file` passed.
- Full `pnpm -s typecheck`, focused `tsc`, full/focused `eslint`, and Vite renderer builds hung in this local environment with no diagnostics. Vite also hung on the pre-existing `vite.mini-settings.config.ts`, so this appears broader than the new popover entry.

Open questions / next steps:

- Run the Electron app manually and inspect tray click positioning on a real multi-display macOS setup.
- Consider adding a Quick Ask button once there is a non-recording IPC entry point for it; current UI exposes Dictation and Command because those existing manager toggles are available.
- If Vite hangs persist, investigate local dependency/runtime behavior before relying on local renderer production builds.

## 2026-05-01 Answer Overlay and Mini Settings Interaction Pass

User asked to continue with answer overlay and mini settings interaction improvements, and allowed implementing recommended changes.

- Answer overlay now has a functional action bar instead of passive shortcut text.
- Streaming answers expose `Stop`; completed answers expose `Retry`, `Copy`, and `Done`.
- Answer body auto-scrolls while streaming so long responses remain readable.
- Cmd/Ctrl+C copies the full answer only when no text selection exists.
- Prompt display is now a compact bounded panel with a `Prompt` label and three-line clamp, reducing overlay height churn.
- Mini Settings window resized from 380x380 to 420x500 and changed from a passive status grid into a control center.
- Mini Settings now exposes Dictate, Command, Fix Permissions, Refresh, Logs, and Quit actions using the Mini IPC actions added for the menubar popover.
- Mini Settings now has a health summary card that prioritizes missing permissions, missing agent, recorder warmup, or ready state.

Verification:

- `CI=true pnpm -s verify:mini` passed 61/61 checks.
- `git diff --check` passed.
- Esbuild syntax/transpile checks passed for:
  - `src/renderer/menubar-popover/index.tsx`
  - `src/renderer/mini-settings/index.ts`
  - `src/renderer/src/modules/agent/AgentWindow.tsx`

Open questions / next steps:

- Manual Electron UI verification is still needed for exact overlay sizing, tray popover placement, and Mini Settings visual density.
- Full Vite/TypeScript/lint verification remains blocked by the local no-output hang observed earlier.

## 2026-05-01 Dictation Quality Pass

User reported Sarah's dictation output felt much weaker than Typeless, especially around punctuation, sentence boundaries, and incomplete spoken phrases. User also reported that the installed Sarah app would not open.

- Runtime diagnosis showed the installed Sarah app was using Volcengine ASR, not Apple Speech fallback. The weak dictation output was primarily a post-processing/refinement issue rather than raw ASR alone.
- The installed app failure came from a manual `app.asar` hot patch path. The app was restored to the last stable `app.asar`, re-signed, and confirmed running again from `~/Applications/Sarah.app`.
- Changed `lightweight-refinement-client.ts` to resolve Ark refinement config dynamically on every call instead of caching config at module construction time. This prevents Settings/.env changes from being ignored by the singleton refinement client.
- Upgraded `dictation-refinement.service.ts` prompts from conservative cleanup to stronger Typeless-style dictation polish: remove fillers, repair spoken restarts, improve punctuation/paragraphs, preserve meaning, and avoid invented facts.
- Lowered smart refinement routing threshold so medium dictations (`>=40` chars), filler-heavy utterances, restarts, lists, and repeated phrases use the stronger structured prompt.
- Increased Ark refinement defaults to 7s timeout and 500 max tokens in config resolution and `.env.example`.
- Relaxed ASR VAD auto-stop from roughly 1.5s of silence to roughly 3s, with a minimum recording duration guard so brief thinking pauses are less likely to truncate speech.
- Added raw/refined transcript previews in voice-mode logs for future debugging.

Verification:

- Targeted esbuild checks passed for `dictation-refinement.service.ts`, `lightweight-refinement-client.ts`, `asr.service.ts`, and `voice-mode-manager.ts`.
- `git diff --check` passed.
- `pnpm -s verify:mini` static checks passed, but packaged checks failed because `out/Sarah-darwin-arm64/Sarah.app` is absent.
- Full `pnpm -s typecheck` and `pnpm -s lint` still hung locally with no output and were terminated.

Known issue / next steps:

- Do not manually replace installed `app.asar` again unless the replacement comes from the normal Forge package flow or the Electron asar integrity/signing path is fully understood. A second manual replacement attempt still caused immediate launch failure and was rolled back.
- Fix the local Forge/Vite packaging hang so these source changes can be installed through `pnpm run install:app`.
- After a normal install, dictate a few real samples and compare `dictation_raw_input`, `model_refinement_success`, and `Voice transcript refined` logs.

## 2026-05-01 Hotkey Settings Review

User asked to inspect whether the earlier user-configurable shortcut work was actually complete from an interaction/UI perspective, and to keep checking previous promised tasks when continuing work.

- Diagnosis: the lower-level hotkey model and runtime rebinding existed, but the current Mini Settings UI only displayed the trigger key hint. The older full Settings / `HotkeysSection` referenced in memory is no longer present after the ClawDesk debug console removal.
- Added an editable Hotkeys card to Mini Settings with a safe trigger-key grid (`Right Ctrl`, `Right Alt`, `Caps Lock`, `Right Cmd`, `F1`-`F12`). It shows the current key, explains `+Shift` for Command and `+Space` for Quick Ask, disables changes while recording, and displays success/error notices.
- Fixed `SAVE_HOTKEY_CONFIG` IPC so renderer callers receive `hotkeyManager.apply()` failures instead of always getting `{ success: true }`.
- Fixed trigger pseudo-modifier cleanup when switching between non-standard trigger keys and standard modifier keys by clearing `KeyboardService.setTriggerKeycode(null)` during dispose / standard-key initialization.
- Trellis task list check returned no active tasks. Previous remembered open items still include packaging/build hang, manual UI verification after normal install, and avoiding manual `app.asar` replacement.

Verification:

- `CI=true pnpm -s verify:mini` passed 61/61.
- Targeted esbuild checks passed for `src/renderer/mini-settings/index.ts`, `src/main/ipc/claw-desk.handler.ts`, and `src/main/services/push-to-talk/voice-mode-manager.ts`.
- `git diff --check` passed.
- `pnpm -s typecheck` still hung locally with no output and was terminated.

Known limitations / next steps:

- Custom arbitrary keycode capture is still not a polished UI. The Mini Settings picker exposes the safe supported keys; if arbitrary key capture is needed, add a proper "press a key to capture" flow instead of asking users to type numeric uiohook keycodes.
- The separate "toggle debug/settings window" accelerator still points at the removed ClawDesk stub and should either be removed from product UI or repurposed to toggle Mini Settings / menubar popover.

## 2026-05-01 High-End UI Polish Follow-Up

User asked whether the earlier Image 2.0 / UI interaction optimization had actually been done, and requested another pass toward a more premium desktop software feel.

- Decision: did not add generated bitmap assets to the Electron surfaces. For small macOS utility panels, the higher-quality path is native-feeling glass material, restrained texture, clear hierarchy, and precise states; generated image assets would add packaging/signing risk without improving the core interaction.
- Menubar popover visual polish:
  - Increased popover height to fit a complete status stack.
  - Added `Refinement` provider status so dictation quality infrastructure is visible next to Speech, Agent, and Recorder.
  - Fixed shortcut copy from `hold to dictate` to `press to dictate`, matching the current press-to-toggle behavior.
  - Added a more refined glass background, subtle grid/noise texture, stronger inner highlight, and better button/status row depth.
- Mini Settings polish:
  - Added a three-mode shortcut deck showing Dictate, Command, and Ask combinations explicitly.
  - Improved shortcut hint copy so users understand they choose one base trigger and Sarah derives the other modes.
  - Added more premium visual treatment for the shell, brand mark, hero panel, selected hotkey buttons, status rows, and action buttons.
- Existing hotkey picker behavior remains intact: safe trigger keys only, disabled while recording, and success/error notice after applying.

Verification:

- `CI=true pnpm -s verify:mini` passed 61/61.
- `git diff --check` passed.
- Targeted esbuild checks passed for `src/renderer/menubar-popover/index.tsx`, `src/renderer/mini-settings/index.ts`, and `src/main/windows/menubar-popover.ts`.
- Standalone `pnpm -s vite build --config vite.mini-settings.config.ts` and `pnpm -s vite build --config vite.menubar-popover.config.ts` hung with no output and were terminated. This matches the existing local Vite/Forge hang and remains unresolved.

Known limitations / next steps:

- Manual visual verification still requires a normal dev/package path. Do not hot-patch the installed `~/Applications/Sarah.app` by replacing `app.asar` again.
- Fix the local Vite/Forge hang before promising that these UI changes are visible in the currently installed desktop app.
- Consider adding a real Quick Ask IPC action so menubar and Mini Settings can expose Ask as an active button instead of only documenting its shortcut.

## 2026-05-02 Gateway Speed and Open-Source Onboarding Pass

User reported the full app UI still looked unsophisticated, asked for a more Claude/ChatGPT/Hermes-like premium feel with subtle pixel texture, reported OpenClaw answers from Sarah taking around a minute while OpenClaw itself answers in seconds, and raised a release risk: new GitHub users may not connect to their local OpenClaw Gateway correctly.

- Diagnosis:
  - The large sidebar Chat UI shown by the user is from the old installed ClawDesk/Control surface; the current source branch has removed that full renderer and only retains Sarah's floating/agent overlay, menubar popover, and Mini Settings.
  - Current `AgentService` used `openclaw agent --json --message <large prompt>` and waited for process completion before emitting pseudo-streamed chunks.
  - Local timing confirmed a trivial `2+2` turn through `openclaw agent` took about 37s total and returned OpenClaw metadata with `contextTokens: 272000`.
  - Calling the running Gateway via `openclaw gateway call agent --expect-final` plus `promptMode=minimal`, `bootstrapContextMode=lightweight`, and `modelRun=true` reduced the same trivial turn to about 4.2s total, with model duration about 1.7s and prompt tokens around 6800.
- Speed changes:
  - `AgentService` now defaults to the Gateway agent path instead of the older direct `openclaw agent` path.
  - Gateway calls pass `thinking=off`, `promptMode=minimal`, `bootstrapContextMode=lightweight`, `modelRun=true`, `cleanupBundleMcpOnRunEnd=true`, a stable Sarah session id, and a per-run idempotency key.
  - Gateway calls now use a short Sarah prompt containing only screen context, context-use rules, recent Sarah actions, and the user request. The old long tool/skill prompt remains only for the fallback direct CLI path.
  - Added environment overrides: `SARAH_OPENCLAW_GATEWAY_AGENT`, `SARAH_OPENCLAW_AGENT_ID`, `SARAH_OPENCLAW_THINKING`, `SARAH_OPENCLAW_PROMPT_MODE`, `SARAH_OPENCLAW_BOOTSTRAP_MODE`, `SARAH_OPENCLAW_MODEL`, `SARAH_OPENCLAW_TIMEOUT_SECONDS`, and `SARAH_OPENCLAW_GATEWAY_TIMEOUT_MS`.
  - Abort now also sends a best-effort `sessions.abort` Gateway call for the active Sarah run.
- Gateway onboarding changes:
  - `claw-desk.ts` now distinguishes missing OpenClaw install, missing config, missing token, and stopped Gateway instead of only returning a generic offline state.
  - `getWorkspaceTarget()` now returns a tokenized local Control UI URL when the Gateway is reachable; otherwise it returns actionable setup/start errors.
  - README and `.env.example` now document `openclaw onboard`, `openclaw gateway start`, `openclaw gateway probe`, and Sarah's lightweight Gateway defaults.
- UI polish:
  - Agent answer overlay now uses a more restrained dark material with subtle warm highlights, pixel-grid texture, squared status pixels, and less generic blue SaaS styling.

Verification:

- Targeted esbuild checks passed for `src/main/services/agent/agent.service.ts` and `src/main/windows/claw-desk.ts`.
- `CI=true pnpm -s verify:mini` passed 61/61.
- `git diff --check` passed.
- `vitest run src/main/services/agent/agent.service.test.ts --runInBand` hung with no output and was terminated, matching the broader local test/build hang pattern seen earlier.
- A focused esbuild attempt for `AgentWindow.tsx` also hung and was terminated; only CSS changed there, and the main-process checks passed.

Known limitations / next steps:

- The current source branch cannot directly restyle the full sidebar Chat UI shown in the user's screenshot because that old ClawDesk renderer is no longer present in active source. If the product should keep that window, restore/rebuild it as a first-class renderer instead of relying on stale installed app assets.
- Gateway path still waits for a final result through `openclaw gateway call`; true token streaming would require a native Gateway WebSocket client and subscription to agent events instead of the CLI wrapper.
- Full package/dev-server verification remains blocked by the local Vite/Forge no-output hang.

## 2026-05-02 Daily Memory Closure and Product Direction

User asked whether the daily conversation summary/memory model was the right product direction, whether Sarah should be merged into OpenClaw or released separately, how local CLIs such as Obsidian/Feishu should be called, and how onboarding should teach users the product without relying on README reading.

- Diagnosis:
  - The daily memory architecture existed, but the active overlay flow did not persist completed user/assistant turns with `saveSession()`, so nightly consolidation could run without a useful daily session file.
  - Consolidation only ran once after app startup and used UTC date keys through `toISOString().slice(0, 10)`, which is wrong for a local daily memory product.
  - Sarah's memory is currently local Sarah memory, not OpenClaw's own long-term memory store.
- Memory changes:
  - `MemoryService.isoDate()` now uses the local calendar date.
  - Added `MemoryService.appendTurn()` to append completed user and assistant messages into the current day session under `~/.feishu-agent/sessions/YYYY-MM-DD.json`.
  - `AgentService` now records each successful completed turn after receiving the OpenClaw response, while the UI can remain transient.
  - `ConsolidationService.startScheduler()` now runs consolidation immediately and schedules the next local 00:10 run, repeating daily.
  - Daily summary generation now uses the lightweight OpenClaw Gateway path instead of the slower full `openclaw agent` path.
  - `agent.handler.ts` now starts the consolidation scheduler at app initialization.
- Product decision:
  - Recommended direction is to keep Sarah as a separate macOS voice/product layer for now, while upstreaming only generic OpenClaw improvements as focused PRs.
  - A whole Electron/macOS assistant is less likely to be accepted into OpenClaw core immediately; small PRs around Gateway, onboarding, installer checks, and integration contracts are more likely to land.
  - A separate release can prove usage and polish first, then support a later official "OpenClaw Desktop Voice" proposal.
- Local CLI strategy:
  - Add a first-class "Local Tools" registry/doctor instead of hard-coding every tool in one prompt.
  - Detect installed CLIs, auth state, executable path, and safe command capabilities; expose install/setup actions; pass discovered capabilities into Sarah/OpenClaw context.
  - Require user consent/allowlists for commands that write files, send messages, or call external services.
- Onboarding strategy:
  - README should remain reference material, but first-run onboarding must check microphone/Input Monitoring/Accessibility, ASR provider state, OpenClaw install/config/Gateway probe, and local tool discovery.
  - The app should show actionable fix buttons and a few demo commands after setup, because many users will not read README.

Verification:

- Targeted esbuild checks passed for `src/main/services/agent/agent.service.ts`, `src/main/services/agent/consolidation.service.ts`, and `src/main/services/agent/memory.service.ts`.
- `CI=true pnpm -s verify:mini` passed 61/61.
- `git diff --check` passed.

Known limitations / next steps:

- Rename the legacy local storage path `~/.feishu-agent` to a Sarah/OpenClaw-specific path with migration.
- Bridge Sarah daily summaries into OpenClaw's own long-term memory or a Sarah-specific OpenClaw workspace memory file; right now they are Sarah-local memory.
- Add a visible Memory/History setting that lets users choose whether raw daily transcripts are kept locally, summarized then pruned, or disabled.
- Build first-run onboarding and a Local Tools registry/doctor as the next high-leverage product work.

## 2026-05-02 Local Tools Registry and Product Surface Reduction

User accepted the recommendation to reduce the old ClawDesk/chat-control-console shape and asked to implement the Local Tools registry directly.

- Local Tools registry:
  - Added shared `local-tools` types and a main-process `LocalToolsService`.
  - Added `LOCAL_TOOLS.GET_SNAPSHOT` IPC, handler registration, preload API, and `window.api.localTools.getSnapshot()`.
  - Detects OpenClaw, Obsidian, and Feishu/Lark CLI with installed path, version when available, auth/setup state, health, setup hint, and safe capability metadata.
  - OpenClaw readiness is based primarily on a reachable local Gateway with configured token; `openclaw whoami` is treated as an additional signal rather than the only auth source.
  - Capability metadata is deliberately conservative: read actions can be enabled automatically; write/message/external actions are marked as requiring explicit approval.
  - `AgentService` now injects a compact Local Tools summary into prompts instead of hard-coding a long CLI/tool instruction block.
- UI/product shape:
  - Mini Settings now shows a Local Tools card with ready/setup/missing status and capability chips.
  - Mini Settings window height increased to make this a first-class release surface.
  - Release shortcut picker is reduced to stable choices: Right Option, Right Cmd, F18, and F19. Complex/custom keycodes remain hidden from the main path.
  - The old toggle-window accelerator now opens Mini Settings instead of targeting the removed ClawDesk stub.
- Memory naming cleanup:
  - Sarah memory now uses `~/.sarah` as the primary directory.
  - `MemoryService.ensureDirectories()` migrates legacy `~/.feishu-agent` data into `~/.sarah` when the new directory does not exist.

Verification:

- Targeted esbuild checks passed for `src/main/services/local-tools/local-tools.service.ts`, `src/main/ipc/local-tools.handler.ts`, `src/main/services/agent/agent.service.ts`, and `src/renderer/mini-settings/index.ts`.
- Direct local tools smoke check returned OpenClaw, Obsidian, and Lark CLI as detected on this machine.
- `CI=true pnpm -s verify:mini` passed 66/66.
- `git diff --check` passed.
- `pnpm -s typecheck` still hung locally with no output after 30 seconds and was terminated, matching the existing local typecheck hang.

Known limitations / next steps:

- Local Tools is detect-only. It does not execute tool actions yet; execution should be added behind explicit per-action approval and allowlists.
- Obsidian detection currently confirms app/CLI presence and assumes URI scheme availability when Obsidian is installed. Vault-level write configuration still needs a real onboarding step.
- Feishu/Lark CLI auth detection is best-effort across common command shapes. Add a specific supported CLI contract before exposing write/send actions.
- The old `clawdesk` internal names remain in legacy IPC/settings modules. User-facing product shape is Sarah-first, but a later cleanup should rename internals once release behavior is stable.

## 2026-05-03 Packaging Recovery and Installed App Verification

User asked to continue the prior UI/product optimization work after packaging had stalled.

- Packaging diagnosis:
  - `electron-forge package` was hanging before build output because importing `forge.config.ts` blocked on `@electron-forge/maker-zip`.
  - The root local cause was a corrupted `node_modules` tree containing 6746 macOS conflict-copy files/directories with ` 2` suffixes, including duplicated `got` and `@electron-forge/maker-zip` package contents.
  - After deleting `node_modules` and running `pnpm install`, conflict-copy count dropped to 0 and direct imports of `got`, `@electron-forge/maker-zip`, and `forge.config.ts` completed in under 200ms.
- Install script fix:
  - `scripts/install-packaged-app.sh` previously copied the packaged bundle with `rsync -a "$PACKAGED_APP_PATH" "$TARGET_APP_PATH"`, which created a nested `~/Applications/Sarah.app/Sarah.app` bundle.
  - Changed the copy step to create the target bundle directory and sync `"$PACKAGED_APP_PATH/"` into `"$TARGET_APP_PATH/"`, so signing operates on `~/Applications/Sarah.app/Contents/...` as intended.
- Installed app verification:
  - `pnpm run install:app` now completes: package, copy, sign, preserve TCC grants, remove build output, and open the installed app.
  - Installed Sarah is running from `/Users/chaosmac/Applications/Sarah.app/Contents/MacOS/Sarah`.
  - `codesign --verify --deep --strict --verbose=2 ~/Applications/Sarah.app` passes.
  - `~/Applications/Sarah.app/Contents/Resources/.env` is present in the packaged app.

Verification:

- `CI=true pnpm -s verify:mini` passed 72/72.
- `pnpm exec electron-forge --version` returned 7.11.1.
- `pnpm run install:app` completed successfully.

Known limitations / next steps:

- Full `pnpm -s typecheck` has historically hung in this local environment; keep using targeted esbuild checks plus `verify:mini` unless the typecheck hang is separately diagnosed.
- Avoid any future installed-app hot-patching of `app.asar`; Electron has embedded asar integrity enabled, so app.asar changes after signing will crash at launch.

## 2026-05-03 Answer Overlay Premium Redesign and Follow-up UX

User showed a screenshot of the answer overlay and said the panel felt too narrow, the text looked odd, and the interaction for follow-up questions was unclear. User asked to use online design references and image generation to make the UI feel more premium.

- Design direction:
  - Used Apple popover guidance, ChatGPT macOS launcher/desktop references, and Raycast keyboard-first utility references to keep the overlay temporary, clear, and action-oriented.
  - Generated a visual reference mockup at `/Users/chaosmac/.codex/generated_images/019de2eb-a507-7ff3-a21a-41583b72e482/ig_0d3a9c84893530a70169f722c756e08191ae213f14355f47b3.png`.
  - Chose a refined macOS utility surface: wider liquid-glass dark panel, subtle pixel grid, warm amber accent, restrained hierarchy, and larger readable Chinese answer text.
- UI changes:
  - `AgentWindowManager` answer overlay size increased from 560x400 to 760x520.
  - Reworked `agent-window.css` around a 720px content surface, better typography, lighter prompt treatment, improved markdown/code styling, stronger contrast, and reduced card-within-card feel.
  - Changed visible labels from generic English (`Answer`, `Prompt`) to product-specific Chinese (`Sarah 回答`, `你刚才说`).
- Follow-up interaction:
  - Added a first-class `继续追问` action in the overlay.
  - Clicking it opens a compact follow-up composer inside the answer overlay.
  - Users can type and press Enter to send, or click the mic button to dictate a follow-up using the existing ASR path.
  - The hint clarifies that this is the right path for continuing the current answer; Right Ctrl + Shift is positioned as starting a new Command from the frontmost app, not as the primary follow-up mechanism.

Verification:

- `CI=true pnpm -s verify:mini` passed 72/72.
- Targeted esbuild checks passed for `src/renderer/src/modules/agent/AgentWindow.tsx` and `src/main/windows/agent.ts`.
- `git diff --check` passed.
- `pnpm -s typecheck` passed.
- `pnpm run install:app` completed successfully and relaunched the installed Sarah app.

Known limitations / next steps:

- Follow-up voice input currently uses the existing ASR path and appends the final transcript into the composer; it does not yet run the dictation refinement prompt before insertion into the composer.
- Manual visual validation still needs the user to trigger an actual Command/Quick Ask and inspect the installed overlay in context.

## 2026-05-06 Hermes Runtime Switcher

User asked whether Sarah can connect to Hermes in addition to OpenClaw, with a low-friction Settings interaction where normal users can switch between OpenClaw and Hermes in one click and Sarah can recognize existing local Hermes setup.

- Local discovery:
  - Confirmed this machine has `~/.local/bin/hermes`, `/Applications/HermesDesktop.app`, `~/.hermes`, `~/Library/Application Support/HermesDesktop/connections.json`, and `~/Library/LaunchAgents/ai.hermes.gateway.plist`.
  - `hermes --version` reports Hermes Agent v0.11.0 and `hermes status` reports the gateway service running via launchd.
- Runtime architecture:
  - Added shared `AgentRuntimeId`, `AgentRuntimeStatus`, and `AgentRuntimeSelection` types.
  - `ClawDeskSettingsService` now stores `selectedAgentRuntime` in `clawdesk-settings.json`.
  - Runtime detection checks OpenClaw and Hermes, including common GUI-launch PATH gaps such as `~/.local/bin`.
  - Effective runtime selection is automatic when no manual choice exists: prefer ready OpenClaw for backwards compatibility, otherwise any ready runtime, otherwise installed runtime as a setup hint.
  - `AgentService` now chooses the effective runtime per run. OpenClaw keeps the existing gateway/CLI path; Hermes uses `hermes --oneshot <prompt>` with `HERMES_ACCEPT_HOOKS=1`.
  - Abort logic only sends OpenClaw gateway aborts when the active runtime is OpenClaw.
- UI / IPC:
  - Added `claw-desk:get-agent-runtime-selection` and `claw-desk:set-agent-runtime` IPC channels plus preload APIs.
  - Mini Settings now shows an `Agent Runtime` card with two one-click options: OpenClaw and Hermes.
- Runtime cards show Ready / Setup / Missing, detected path or setup hint, and whether Sarah is using Auto or Manual selection.
- Runtime cards now act as connectors, not just selectors: clicking Hermes opens Hermes Desktop when available or falls back to `hermes setup` in Terminal; clicking OpenClaw selects it, attempts `openclaw gateway start`, and falls back to terminal onboarding if needed.
- OpenClaw readiness now matches the actual default execution path more closely: when `SARAH_OPENCLAW_GATEWAY_AGENT` is enabled, Sarah requires a configured and reachable OpenClaw gateway rather than only `openclaw whoami`.
- First-run checklist now says `Agent runtime` instead of `OpenClaw agent`.
- Local Tools registry now includes Hermes as an agent tool with install/setup/gateway signals.

Verification:

- `hermes --help`, `hermes --version`, `hermes status`, local launchd plist, and HermesDesktop connection files were inspected.
- Targeted esbuild checks passed for `src/main/services/agent/agent.service.ts`, `src/main/services/clawdesk/settings.service.ts`, `src/main/services/local-tools/local-tools.service.ts`, `src/preload.ts`, and `src/renderer/mini-settings/index.ts`.
- Targeted esbuild also passed for `src/renderer/menubar-popover/index.tsx`.
- `CI=true pnpm -s verify:mini` passed 72/72.
- `pnpm -s typecheck` and targeted ESLint still hung locally with no diagnostics and were terminated; this matches the existing local toolchain hang noted in prior entries.

Known limitations / next steps:

- Hermes integration currently uses CLI one-shot mode, not a native Hermes gateway API. This is good enough for first switching UX but may not preserve warm session behavior as well as OpenClaw gateway sessions.
- The runtime switcher is in Mini Settings only. If a future full settings surface returns, reuse the same IPC and runtime selection data instead of adding a second store.
- Manual visual validation still needs Sarah to be launched and Mini Settings opened so the runtime card can be checked in the real Electron window.

## 2026-05-06 Answer Overlay Light Redesign

User said the current answer overlay was still ugly, specifically rejecting the black/gold flavor and the strange transparent outer area around the panel. User asked to keep the current interaction model but redesign the visual style toward Hermes, Claude Code, or ChatGPT.

- Design direction:
  - Generated a new light visual reference with Image 2.0 at `/Users/chaosmac/.codex/generated_images/019de2eb-a507-7ff3-a21a-41583b72e482/ig_0d3a9c84893530a70169fb175da2488191ba6ce764071efc8d.png`.
  - Moved away from dark grid and black/gold styling toward a clean Claude/ChatGPT-like warm stone surface.
  - Removed decorative grid texture and gold accents; primary accent is now a quiet blue.
- Visual changes:
  - `agent-window.css` now makes the overlay fill the transparent Electron window (`100vw`/`100vh`) so the previous outer transparent gutter should no longer appear.
  - Reworked the panel surface to a warm light translucent material with neutral borders, readable dark text, and softer native-macOS-style controls.
  - Kept the existing follow-up interaction and action layout, but restyled buttons, status dots, follow-up composer, code blocks, and scroll affordance for the light theme.
- Interaction copy:
  - Replaced the hard-coded `Right Ctrl + Shift` follow-up hint with generic wording: the user's configured Command hotkey should be used for starting a new task from the frontmost app.

Verification:

- Targeted esbuild checks passed for `src/renderer/src/modules/agent/AgentWindow.tsx` and `src/main/windows/agent.ts`.
- `git diff --check` passed for the touched answer-overlay files.
- `CI=true pnpm -s verify:mini` passed 72/72.
- `pnpm run install:app` completed successfully after rebuilding a corrupted `node_modules` directory that had again accumulated macOS ` 2` conflict-copy files.

Known limitations / next steps:

- Full `pnpm -s typecheck` again hung with no output and was terminated, matching prior local toolchain behavior.
- Worktree already had unrelated dirty runtime-switcher and settings files before this UI pass; do not accidentally include those when committing only the overlay redesign.
- User still needs to trigger an actual Command/Quick Ask to visually inspect the installed light overlay in context.

## 2026-05-06 Context Acquisition and Feishu Workflow Prompt

User reported that Sarah failed the simple workflow "整理当前 Codex 页面并保存到飞书": it told the user to take a screenshot or confirm broad steps instead of actively acquiring context. User clarified the expected interaction: web pages should be read through web-access first, non-web apps should be handled by screenshot recognition, and web-access failures should fall back to screenshot recognition.

- Root cause:
  - The OpenClaw gateway prompt was much weaker than the full agent prompt and did not enforce the page/screenshot fallback policy.
  - The old wording still allowed the agent to ask the user for a URL, text body, or screenshot too early.
  - If Sarah's answer overlay was visible and the user started another Command, context capture could identify Sarah itself as the frontmost app, producing context like `Sarah / ASR Status`.
- Behavior changes:
  - Added a shared context acquisition policy in `AgentService`:
    - URL present: use web-access/browser first, then screenshot fallback.
    - Browser with no URL: attempt current-tab/browser access, then screenshot fallback.
    - Non-web app: analyze the captured screenshot directly.
    - Ask the user for content only when URL, browser access, and screenshot are all unavailable.
    - For Feishu/Obsidian/file writes, ask only for write authorization or target confirmation, not for manual screenshots or copied page content.
  - Injected this policy into both `buildGatewayPrompt()` and the full `buildPrompt()` path.
  - Updated the Feishu decision tree to treat Codex/CodePilot and other non-browser apps as screenshot-first contexts.
  - `VoiceModeManager.startCommandMode()` now hides the Sarah answer overlay before context capture, waits briefly, then captures the underlying app context.
- Installed app verification:
  - `pnpm run install:app` completed successfully and relaunched `/Users/chaosmac/Applications/Sarah.app`.
  - `codesign --verify --deep --strict --verbose=2 /Users/chaosmac/Applications/Sarah.app` passes.

Verification:

- `CI=true pnpm -s verify:mini` passed 72/72.
- Targeted esbuild checks passed for `src/main/services/agent/agent.service.ts` and `src/main/services/push-to-talk/voice-mode-manager.ts`.
- `git diff --check` passed for the touched prompt/context files.

Known limitations / next steps:

- The screenshot fallback depends on the downstream runtime's ability to inspect an image path. If OpenClaw/Hermes cannot actually read image files in its current toolset, add an explicit Sarah-side OCR/vision preprocessor before spawning the runtime.
- The worktree already contains unrelated dirty runtime/UI/settings changes. Do not commit the entire dirty tree when saving only this prompt/context fix.

## 2026-05-06 Commercial Polish: Tray, Hermes Tool Scope, Local CLI Clarity

User said the current state is broadly good but found two commercial-readiness issues: clicking the menu bar icon opened both Sarah's custom popover and the native tray menu, and Hermes could answer identity questions but was slow/unclear when operating the computer or calling Feishu CLI.

- Tray/menu fix:
  - `main.ts` now keeps the native tray menu in memory instead of attaching it with `tray.setContextMenu()` on macOS.
  - Left click opens only the custom Sarah popover.
  - Right click hides the custom popover and manually opens the native diagnostics menu.
  - This addresses the overlapping surfaces shown in the user's screenshots.
- Hermes runtime tuning:
  - Hermes is still launched through one-shot mode, but Sarah now passes an explicit toolset list.
  - Default Hermes toolsets are optimized for faster read/write tasks: `web,terminal,file,vision,skills,todo,messaging`.
  - Browser automation is enabled only when the instruction clearly asks for clicking, opening, filling, logging in, scrolling, or controlling a browser/page. This should reduce unnecessary Chrome automation for simple "整理当前页面/保存到飞书" tasks.
  - Agent logs now include the selected runtime and Hermes toolsets.
- Local Tools clarity:
  - Local Tools summary now includes exact binary paths in the agent context.
  - Feishu/Lark detection now exposes the concrete `/opt/homebrew/bin/lark-cli` path and uses correct command families: `docs`, `drive`, `wiki`, and `im`.
  - The prompt now explicitly says the Feishu CLI is usually `lark-cli`, not `lark` or `feishu`, and tells the runtime to use the exact detected binary path.
  - Added prompt guidance to prefer API/CLI/text extraction before slow GUI/browser automation.

Verification:

- `CI=true pnpm -s verify:mini` passed 72/72.
- Targeted esbuild checks passed for `src/main.ts`, `src/main/services/agent/agent.service.ts`, and `src/main/services/local-tools/local-tools.service.ts`.
- `git diff --check` passed for the touched files.
- `pnpm run install:app` completed successfully, relaunched `/Users/chaosmac/Applications/Sarah.app`, and `codesign --verify --deep --strict --verbose=2` passes.

Known limitations / next steps:

- Hermes one-shot mode still returns final output only; Sarah cannot show true step-by-step Hermes tool progress unless Hermes exposes streaming/tool events or Sarah switches to a different Hermes integration surface.
- For a polished commercial release, add a runtime progress surface that distinguishes "reading page", "running CLI", "waiting for authorization", and "writing to destination" instead of showing a generic thinking state.

## 2026-05-08 Autonomous Review and Debug Loop

User asked for autonomous review/debug cycles until no reproducible bugs remained.

- Started from Trellis workflow/context, read frontend/backend/cross-layer guidelines, and inspected the existing dirty worktree without reverting prior user/agent changes.
- Found one failing test in `AgentService`: the ENOENT assertion still expected the old lowercase `openclaw CLI 未找到` message after the runtime-aware OpenClaw/Hermes error text changed.
- Fixed the test to assert the new runtime-aware OpenClaw error and Settings-switch guidance.
- Found and fixed a real abort race introduced by async runtime resolution: if `abort()` happened after `execute()` marked the service running but before the runtime process was spawned, the old run could still spawn. `AgentService` now checks `runVersion` and `running` immediately after runtime resolution and exits before spawning stale runs.
- Added a regression test covering abort during runtime resolution so future runtime-selection changes do not reintroduce that stale-spawn path.
- Updated Mini Settings health copy to be runtime-neutral: users are told to connect Hermes or OpenClaw instead of only OpenClaw.

Verification:

- `pnpm -s test` passed 43/43 tests.
- `pnpm -s typecheck` passed.
- `pnpm -s lint` passed.
- `CI=true pnpm -s verify:mini` passed 72/72.
- `git diff --check` passed.
- Vite production builds passed for main/preload-equivalent configs plus renderer, floating, mini settings, and menubar popover entries. Existing Vite CJS/lucide `"use client"` warnings are dependency/build warnings, not failures.
- `pnpm run install:app` completed successfully, packaged, signed, installed, and relaunched `/Users/chaosmac/Applications/Sarah.app`.

Known limitations / next steps:

- Manual in-app validation is still useful for visual behavior: open Mini Settings, click Hermes/OpenClaw runtime cards, and trigger Command/Quick Ask from a frontmost app.
- Hermes integration still uses one-shot final output only; progress/streaming remains a product improvement rather than a local test failure.

## 2026-05-09 Gateway Streaming and First-Run Onboarding

User asked whether the remaining TODOs were still open: Hermes only had one-shot final output/no progress, first-run onboarding was not formal enough, `~/.feishu-agent` had migrated to `~/.sarah`, and Sarah still needed a real streaming Gateway WebSocket client instead of a CLI wrapper. User then asked to implement, review, and debug.

- Status confirmed:
  - `~/.feishu-agent -> ~/.sarah` migration was already implemented in `MemoryService.ensureDirectories()`.
  - First-run onboarding was still basic and lacked a focused Gateway/demo step.
  - OpenClaw execution still used `openclaw gateway call agent --expect-final`, so it waited for a final CLI result.
  - Hermes still has no confirmed local streaming agent WebSocket API in the inspected CLI; Sarah keeps Hermes as a CLI fallback and labels it honestly.
- Gateway streaming implementation:
  - Added `src/main/services/agent/openclaw-gateway-client.ts`, a native WebSocket client for the local OpenClaw Gateway.
  - The client reads `~/.openclaw/openclaw.json`, connects to `ws://127.0.0.1:<gateway-port>`, performs the protocol v3 `connect` handshake with `tool-events`, sends `agent` requests, ignores the initial `accepted` response, and waits for the final response.
  - `agent` event `stream:"assistant"` deltas are forwarded immediately to Sarah's answer overlay.
  - Non-assistant Gateway streams are forwarded as `tool_use` progress chunks so the UI can show lifecycle/tool progress without appending it to the answer text.
  - Abort now sends `sessions.abort` over the same WebSocket protocol instead of spawning `openclaw gateway call`.
  - `SARAH_OPENCLAW_WS_AGENT=0` is available as a fallback to the old CLI wrapper path for debugging.
- UI/onboarding:
  - Answer overlay now tracks progress text from `tool_use` chunks (`Connecting`, accepted, tool/lifecycle updates) separately from final answer content.
  - Hermes runs now emit an explicit `Starting Hermes CLI fallback` progress chunk, but still do not claim native token/tool streaming.
  - First-run welcome checklist now includes microphone, Accessibility, Input Monitoring, speech provider, agent runtime, Gateway check, and local tools.
  - Welcome card now includes demo actions for Dictate, Command, and rerunning checks.
  - Local Tools now describes OpenClaw agent capability as Gateway WebSocket streaming; Hermes is described as a CLI fallback.
- Review/debug follow-up:
  - Tightened Gateway event filtering by using the request `idempotencyKey` as the initial run id and updating it from the `accepted` response, preventing stale events from another run from leaking into the UI.
  - Added a regression test proving OpenClaw Gateway WebSocket deltas stream without spawning the CLI wrapper.

Verification:

- `pnpm typecheck` passed.
- `pnpm test` passed 44/44 tests.
- `pnpm lint` passed.
- Initial `pnpm verify:mini` failed only because packaged output was missing; ran `pnpm package`, then `pnpm verify:mini` passed 87/87 checks.

Known limitations / next steps:

- Hermes remains a CLI fallback (`hermes --oneshot`) because no native local streaming Hermes agent API was confirmed. If Hermes exposes one later, add a Hermes-specific streaming transport behind the same `AgentService` chunk contract.
- Manual visual validation is still useful: open Mini Settings on a fresh profile state, confirm the welcome checklist/demo layout, then trigger Command/Quick Ask and confirm progress text appears before/during streamed OpenClaw output.

## 2026-05-09 README Product Screenshots

User asked whether Sarah can manipulate the local computer to test the project, capture screenshots, and add product-relevant README images for the recording flow, Command mode, and Quick Ask mode.

- Added a repeatable screenshot harness:
  - `scripts/capture-readme-screenshots.cjs` launches Electron against the built `.vite` renderer output.
  - It uses the real preload/React/CSS bundles and mock IPC payloads to render deterministic README states without requiring live microphone input or capturing the user's desktop.
  - Added `pnpm screenshots:readme`.
- Generated PNG assets in `docs/images/`:
  - `product-recording.png` — recording HUD with waveform/cancel/confirm.
  - `product-command.png` — Command mode answer overlay with current-app context and Feishu-oriented action copy.
  - `product-quick-ask.png` — Quick Ask answer overlay.
  - `product-onboarding.png` — first-run onboarding with permission/runtime/Gateway/demo checks.
- README updates:
  - Replaced the old "What it looks like" section with a product walkthrough.
  - Added first-run onboarding, Dictation/recording, Command mode, Quick Ask mode, and retained menubar/control-center references.
  - Documented `SARAH_OPENCLAW_WS_AGENT`.
- Debug fixes found while generating screenshots:
  - Mini Settings now tolerates missing optional display strings in `escapeHtml()`, gateway URL labels, runtime detail labels, and local tool health labels instead of throwing during render.
  - Mini Settings health/hotkey copy now truncates cleanly inside compact cards instead of overflowing the panel.

Verification:

- `pnpm package` passed and regenerated the renderer bundles used by the screenshot harness.
- `pnpm screenshots:readme` passed and wrote all four PNG files.
- `pnpm typecheck` passed.
- `pnpm test` passed 44/44 tests.
- `pnpm lint` passed.
- `pnpm verify:mini` passed 87/87 checks.

Known limitations / next steps:

- The screenshot harness intentionally uses deterministic mock IPC payloads. It is suitable for README images and renderer regression smoke coverage, but it does not replace one manual microphone hotkey pass on a freshly installed app.

## 2026-05-10 Silent Demo Video

User asked whether Sarah could produce a demo video, save it in the project root, and leave it ready for the user to add voiceover.

- Fast-forwarded local `main` to the merged README/streaming work so the latest screenshot harness and product assets were present.
- Ran `pnpm package` to rebuild current Electron/Vite output.
- Ran `pnpm screenshots:readme` to refresh the deterministic product visuals from the current build.
- Created `sarah-demo-video.mp4` in the repository root, then removed it after the user rejected the screenshot-based approach as not useful for product demo.
  - 1920x1080, 30fps, 28 seconds, H.264 MP4, no audio track.
  - Walkthrough order: first-run onboarding, Dictation recording HUD, Command mode, Quick Ask mode.
  - Uses current generated product screenshots as stable visuals so the file is safe for voiceover and does not depend on live microphone/permission dialogs.
- Reverted the incidental regenerated `product-recording.png` binary difference and removed the temporary preview frame. No demo MP4 remains in the working tree.

Verification:

- `ffprobe` confirmed `sarah-demo-video.mp4` is 1920x1080, 30fps, 28 seconds.
- Extracted and visually inspected a frame from the Command section to confirm the video is not black and the composition is readable.

Known limitations / next steps:

- The rejected video was a silent walkthrough assembled from deterministic app screenshots, not a live microphone/screen recording. If a real demo is needed later, record from the installed app with real hotkey input after granting macOS permissions.

## 2026-05-10 UI/Interaction Review and Debug

User rejected the screenshot-based MP4 as low-value and asked for a UI/interaction review, optimization pass, then another review/debug loop.

- Removed the generated `sarah-demo-video.mp4`.
- Review findings:
  - Mini Settings exposed Dictate and Command but not Quick Ask as a first-class action, even though the product has three primary modes.
  - The recording HUD was visually compact but ambiguous: it showed waveform/actions without text explaining the active mode or phase.
  - Agent overlay streamed output, but progress was only a small status label; users could not quickly distinguish mode, progress, question, and final answer hierarchy.
  - Local tool approval buttons were embedded inside chips without click isolation.
  - README screenshot harness used an invalid `ControlRight` mock value and the old HUD capture dimensions, causing truncated hotkey copy and a black area in the recording PNG.
- Implemented:
  - Added Mini Quick Ask IPC (`mini:toggle-quick-ask`) through channel constants, preload types, main handler, and `VoiceModeManager.testQuickAskToggle()`.
  - Added Quick Ask to Mini first-run demos and the persistent action grid.
  - Expanded the floating HUD to 220x48 with mode + phase labels (`Dictating / Listening`, `Command`, `Quick Ask`, etc.) alongside waveform and cancel/confirm buttons.
  - Added an Agent overlay progress rail showing `Command` or `Quick Ask`, current progress, and an animated activity line while streaming.
  - Stopped approval action clicks from bubbling.
  - Shortened Mini hotkey hints and fixed the screenshot mock trigger key to `CtrlRight`.
  - Updated screenshot capture dimensions for the new HUD and regenerated all README product PNGs.
  - Added `mini:toggle-quick-ask` to `verify:mini` IPC checks.
- Verification:
  - `pnpm typecheck` passed.
  - `pnpm lint` passed.
  - `pnpm test` passed 44/44 tests.
  - `pnpm package` passed.
  - `pnpm screenshots:readme` passed and regenerated all four product screenshots.
  - `pnpm verify:mini` passed 88/88 checks.

Known limitations / next steps:

- This pass improves the shipped surfaces and deterministic product screenshots. It still does not replace a real installed-app interaction recording with mouse/keyboard/microphone input.
- The welcome demo row descriptions are intentionally truncated in the narrow Mini panel; if marketing screenshots need full text, create a dedicated wider marketing capture instead of overfitting the app UI.

## 2026-05-13 Voice Cue and Dictation Clipboard Fallback

User asked to strengthen voice input behavior:

- Play a small cue when any of the three voice modes opens and when it closes.
- In Dictation only, insert recognized/refined text directly when a text cursor/input target exists.
- If Dictation has no likely text target, copy the final text to the clipboard and notify the user: `刚刚说的内容已经进入到剪切板了`.
- Do not copy Command or Quick Ask text to the clipboard because those modes execute through the agent.
- Review/debug after implementation.

Implemented:

- Added `shell.beep()` start/stop cues in `VoiceModeManager` for Dictation, Command, Quick Ask, and cancel.
- Extended `TextInputService.insert()` to return a destination: `inserted` or `clipboard`.
- Added a macOS Accessibility-based focused text target probe using `AXFocusedUIElement`.
  - If the focused role looks like text input (`AXTextField`, `AXTextArea`, combo/search field, text/editor subrole), Sarah attempts native insertion.
  - If no likely text target is found, Sarah writes the dictation result to the clipboard.
  - If the probe itself fails, Sarah attempts native insertion first to avoid false-positive clipboard fallback.
  - If native insertion throws, Sarah falls back to clipboard.
- Added `asr:notice` IPC, preload typing, `useASRStatus()` notice state, and `FloatingWindowManager.sendNotice()` so clipboard fallback is shown as a normal success notice rather than an error.
- Widened the compact floating HUD from 220px to 280px so the Chinese clipboard notice has room.
- Updated README screenshot capture width for the widened recording HUD.
- Updated `verify-mini-integration.ts` to check the voice cue, clipboard fallback, focused-target probe, and notice IPC.
- Changed `verify-mini-integration.ts` from shelling out to `npx asar` to direct `@electron/asar` API calls because the local `npx asar` subprocess stalled during verification.
- Added targeted `VoiceModeManager` tests for cue calls, clipboard fallback notice, and ensuring Command/Quick Ask do not call `textInputService.insert()`.

Verification:

- `node --experimental-strip-types --no-warnings scripts/verify-mini-integration.ts` passed 94/94 checks.
- Syntax transform check with `esbuild.transformSync()` passed for all changed TS/TSX files.

Blocked / not completed:

- `pnpm typecheck` did not complete in this environment. Sampling showed the `tsc --noEmit` process blocked in a filesystem `read()` while reading `node_modules/undici-types/diagnostics-channel.d.ts`; it was killed after several minutes with no diagnostic output.
- `pnpm test -- src/main/services/push-to-talk/voice-mode-manager.test.ts` did not reach Vitest startup output within 60 seconds and was killed.
- `pnpm package` printed the script header but did not spawn visible Electron Forge work within 60 seconds and was killed. A direct `node node_modules/@electron-forge/cli/dist/electron-forge.js package` attempt also produced no output within 120 seconds.

Known limitations / next steps:

- The focused text target detection is a macOS Accessibility heuristic. It is intentionally conservative: clear non-text focus copies to clipboard, probe failures attempt native insertion first.
- Re-run `pnpm typecheck`, `pnpm test`, and `pnpm package` after the local Node/FS stall is resolved.
- After successful packaging, re-run `pnpm screenshots:readme` so `product-recording.png` reflects the 280px HUD width.

### Follow-up: Audible Cue Debug

User reported they did not hear the cue.

- Root cause found:
  - Source had used Electron `shell.beep()`, which is too weak/unreliable on macOS and can be inaudible depending on system alert settings.
  - The currently installed `/Users/chaosmac/Applications/Sarah.app` and `out/Sarah-darwin-arm64/Sarah.app` did not contain the new cue code at all because packaging had not completed after the source change.
- Source fix:
  - `VoiceModeManager.playVoiceCue()` now calls `/usr/bin/afplay -v 0.35` directly.
  - Start cue uses `/System/Library/Sounds/Ping.aiff`.
  - Stop cue uses `/System/Library/Sounds/Pop.aiff`.
  - If `afplay` fails, it falls back to `shell.beep()`.
  - Direct terminal playback of both sound files completed successfully.
  - `verify-mini-integration.ts` now checks for `/usr/bin/afplay` instead of `shell.beep()`.
- Verification:
  - `esbuild.transformSync()` syntax check passed for `voice-mode-manager.ts` and `verify-mini-integration.ts`.
  - `node --experimental-strip-types --no-warnings scripts/verify-mini-integration.ts` passed 94/94 checks.
- Important failed attempt:
  - Tried to patch installed `app.asar` directly so the running app could get sound immediately.
  - Electron ASAR integrity rejected the modified archive at launch.
  - Restored both `app.asar` files from `.bak-voice-cue` backups immediately.
  - Smoke-tested restored installed app with `SARAH_SMOKE_TEST=1`; tray/hidden debug console/recorder/IPC checks all passed.

Next step:

- The source is fixed, but the installed app still needs a successful Forge package/install run before the audible cue appears in the real app.

### Follow-up: Installed App Would Not Open

User reported Sarah could no longer be opened.

- Diagnosis:
  - The installed app bundle signature and ASAR integrity were restored and valid.
  - `SARAH_SMOKE_TEST=1 /Users/chaosmac/Applications/Sarah.app/Contents/MacOS/Sarah` passed tray, hidden debug console, recorder window, and recorder IPC checks.
  - A stale Sarah process from the earlier failed ASAR patch attempt remained as PID `58910` in `UEs` state. `kill -9` could not terminate it.
  - LaunchServices still had that stale PID registered as the running `com.sarah.app`, so normal `open` treated Sarah as already running.
- Fix applied:
  - Used `lsappinfo kill -force -hard 58910` to remove the stale LaunchServices registration.
  - Started a new Sarah instance with `open -n /Users/chaosmac/Applications/Sarah.app`.
  - Verified normal `open /Users/chaosmac/Applications/Sarah.app` now brings the new instance to front.
  - Re-ran `codesign --verify --deep --strict --verbose=2`; installed Sarah is valid on disk and satisfies its Designated Requirement.
- Current state:
  - Normal running Sarah instance is PID `72435`.
  - The old kernel-level PID `58910` is still visible in `U` state, but it is no longer registered with LaunchServices and no longer blocks app launch.
  - A macOS reboot will be needed eventually to clear that unkillable stale process from the kernel process table.

### 2026-05-14 Runtime, OCR, Timeline Pass

User asked whether Sarah should add built-in Codex CLI / Claude Code CLI alongside Hermes and OpenClaw, and asked to implement the five priority capabilities: streaming Gateway client, screen OCR/current-app context, Feishu write workflow, first-run onboarding, and Action Timeline UI, then review/debug.

Implemented this pass:

- Added optional agent runtimes: `codex` and `claude`.
  - `AgentRuntimeId` is now `openclaw | hermes | codex | claude`.
  - Mini Settings and menubar runtime labels now understand all four runtimes.
  - Settings runtime detection now reports Codex CLI and Claude Code CLI install/config status.
  - Runtime setup opens `codex` or `claude` in Terminal for sign-in.
  - `AgentService` can spawn:
    - OpenClaw Gateway WebSocket / gateway call / CLI as before.
    - Hermes via `hermes --oneshot` as before.
    - Codex via `codex exec --json --cd <cwd>`.
    - Claude Code via `claude -p --output-format text`.
  - Codex JSONL events are parsed for tool progress and assistant messages when available.
- Added best-effort screenshot OCR for non-browser apps.
  - New `scripts/ocr-image.swift` uses macOS Vision text recognition for zh-Hans, zh-Hant, and en-US.
  - `ContextCaptureService.capture()` now attaches `ocrText` when Screen Recording is granted and screenshot OCR succeeds.
  - Agent prompts include `截图 OCR` and explicitly tell the runtime to use it for Telegram/WeChat/PDF/image/non-browser visible content.
  - `ContextBar` shows an OCR badge with character count when OCR context exists.
- Strengthened Feishu/Lark workflow context.
  - AgentService now resolves `lark-cli` instead of the stale `lark` binary name for local path hints.
  - Local tool summary continues to tell agents to use the concrete detected Feishu CLI path and to execute write actions only when explicitly requested/approved.
- Added Action Timeline UI to the answer overlay.
  - Tool/progress chunks now append to a compact timeline under the progress rail.
  - Completion/error states add a final timeline event.
- Extended local tool detection to include Codex and Claude Code so onboarding/settings can surface them next to OpenClaw, Hermes, Obsidian, and Lark.
- Updated `verify-mini-integration.ts` static checks for Codex/Claude runtime IDs, AgentService binary resolution, OCR context capture, and Action Timeline UI.

Important product decision:

- Codex CLI should be treated as a selectable local coding-agent runtime, not as Sarah's desktop Computer Use layer.
- OpenAI Codex App has Computer Use behavior in the app context, but the open-source Codex CLI is a terminal/coding agent interface. Sarah's desktop control should remain Sarah-owned: current-app capture, screenshot/OCR, browser/page tools, and Feishu/Lark connectors.

Verification:

- `pnpm -s verify:mini` passed 100/100 checks after adding the new source checks.
- `./node_modules/.bin/esbuild src/main/services/agent/agent.service.ts --bundle --platform=node --format=cjs --outfile=/tmp/sarah-agent-service.cjs --external:electron --external:uiohook-napi --external:@xitanggg/node-insert-text` passed.
- `./node_modules/.bin/esbuild src/main/services/clawdesk/settings.service.ts --bundle --platform=node --format=cjs --outfile=/tmp/sarah-settings-service.cjs --external:electron --external:uiohook-napi` passed.
- `./node_modules/.bin/esbuild src/main/services/local-tools/local-tools.service.ts --bundle --platform=node --format=cjs --outfile=/tmp/sarah-local-tools.cjs --external:electron` passed.
- `./node_modules/.bin/esbuild src/renderer/src/modules/agent/AgentWindow.tsx --bundle --format=esm --platform=browser --outfile=/tmp/sarah-agent-window.js --loader:.css=empty --loader:.woff2=file` passed, but took about 215 seconds.
- `swiftc -typecheck scripts/ocr-image.swift` passed.
- `git diff --check` passed.

Known bugs / open questions:

- `tsc --noEmit --pretty false --skipLibCheck` still stalls locally with no diagnostics, matching the earlier TypeScript toolchain hang. It was killed after waiting.
- Codex/Claude runtime readiness currently uses local config-directory presence as the non-invasive auth signal. Real auth/tool permission errors are surfaced on first actual run.
- Claude Code is currently wired as one-shot text output, not stream-json partial streaming. OpenClaw Gateway remains the primary real streaming path.
- OCR only covers visible screenshot text. It does not unlock hidden Telegram/WeChat history or private app internals.
- Existing packaged app output under `out/` may be stale relative to source; run the supported packaging/install flow when local Forge stops stalling.

Concrete next steps:

- If deeper streaming parity is needed, add Claude `--output-format stream-json --include-partial-messages` parsing and stronger Codex JSONL event parsing after capturing real event samples.
- Add a deterministic Feishu quick action for “current page/visible OCR -> Feishu doc/message” using `localTools.execute` or direct lark-cli command schemas, instead of relying only on agent prompt policy.
- Improve first-run onboarding copy to explicitly show OCR, Feishu login, and Codex/Claude runtime options as separate checks.
- Re-run full typecheck/test/package once the local TypeScript/Forge stall is resolved.

### 2026-05-14 Computer Use, Codex Source, Streaming Runtime Follow-up

User asked whether the screen OCR context had really been tested, noted that Hermes now has Computer Use, suspected OpenClaw may have an equivalent, mentioned a persistent `/go` style command, and asked to continue integrating Codex/Claude Code and download/test the open-source Codex project.

What changed:

- Verified screen OCR against the live macOS desktop twice.
  - `screencapture -x /tmp/sarah-ocr-live.png && swift scripts/ocr-image.swift /tmp/sarah-ocr-live.png` successfully read Telegram window text earlier in the session.
  - A second live test on the Claude window read menu/sidebar/date text, confirming the OCR path works on current screen contents rather than only static fixtures.
- Downloaded OpenAI Codex source to `~/.sarah/vendor/openai-codex`.
  - Repository clone succeeded at commit `6d65686313`.
  - Existing local Codex CLI is `/Applications/Codex.app/Contents/Resources/codex`, version `codex-cli 0.130.0-alpha.5`.
- Tested Codex CLI JSON streaming.
  - Earlier real run of `codex exec --json --cd /tmp --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox 'Say exactly: SARAH_CODEX_OK'` produced `{"type":"item.completed","item":{"type":"agent_message","text":"SARAH_CODEX_OK"}}`.
  - Fixed Sarah's Codex JSONL parser to handle top-level `item`, not only `params.item`.
  - A later retest hit the Codex account usage limit, so current runtime availability is now blocked by quota until the reset time shown by Codex.
- Tested Claude Code stream-json mode.
  - `claude -p --verbose --output-format stream-json --include-partial-messages --permission-mode default 'Say exactly: SARAH_CLAUDE_OK'` streamed a `content_block_delta` with `SARAH_CLAUDE_OK`.
  - Updated Sarah's Claude runtime from one-shot text output to stream-json with partial message parsing, while ignoring duplicate final assistant objects.
- Added Hermes Computer Use detection and setup path.
  - `hermes --version` reports `Hermes Agent v0.13.0 (2026.5.7)`.
  - `hermes computer-use status` reports `cua-driver: not installed`.
  - Sarah now lists `cua-driver` in the CLI catalog, reports Hermes Computer Use status, gates the `computer_use` toolset on actual `cua-driver` presence, and exposes a consented setup action that opens `hermes computer-use install` in Terminal.
  - Sarah does not silently run the installer because it downloads/installs an external macOS automation driver and requires Accessibility/Screen Recording permissions.
- Added OpenClaw desktop automation detection.
  - `openclaw skills list` shows `peekaboo` as the OpenClaw screen capture/macOS UI automation skill and currently marks it `needs setup`.
  - Sarah now surfaces `openclaw-peekaboo` as a local tool with ready/needs-setup status.

Important decisions and tradeoffs:

- Treat Hermes Computer Use and OpenClaw Peekaboo as explicit desktop automation backends, not as always-on hidden behavior.
- Auto-detect and guide setup by default; require explicit user consent before opening installers or enabling desktop-control capabilities.
- The user's `/go` reference was not confirmed as an exact installed slash command. Observed related items were Hermes `/goal` and OpenClaw `gog`/`goplaces`; do not hard-code `/go` until a real CLI command sample is captured.

Verification:

- `CI=true pnpm -s verify:mini` passed 93/93 checks.
- `node --experimental-strip-types --check scripts/verify-mini-integration.ts` passed.
- `swiftc -typecheck scripts/ocr-image.swift` passed.
- Scoped `git diff --check` passed for the files changed in this follow-up.
- Non-CI `pnpm -s verify:mini` passed source and packaged ASAR checks but failed packaged smoke with `spawnSync ... ETIMEDOUT` plus macOS Keychain auth errors; this is an environment/runtime permission issue, not a source static-check failure.
- esbuild bundle checks for changed services stalled on the existing esbuild service process in this local environment and were terminated to avoid leaving long-running validation jobs.

Known bugs / open questions:

- `cua-driver` is not installed, so Hermes Computer Use is detected but not usable yet.
- OpenClaw `peekaboo` is present but needs setup.
- Codex CLI is installed and was tested successfully once, but the latest retest is blocked by Codex account usage limits.
- Full packaged smoke still needs a clean macOS session or permission reset because the current run timed out on Keychain/packaged app startup.

Concrete next steps:

- Add UI affordances in onboarding/settings for “Install Hermes Computer Use backend” and “Set up OpenClaw Peekaboo”.
- After the user approves, run `hermes computer-use install`, grant macOS permissions, and re-run `hermes computer-use status`.
- Follow OpenClaw's peekaboo setup instructions and re-run `openclaw skills list`.
- Once Codex quota resets, rerun the Codex JSONL smoke command and verify Sarah's Action Timeline shows Codex progress in-app.

### 2026-05-15 Onboarding and Local Tool Setup Follow-up

User said “继续” after the Codex/Hermes/OpenClaw follow-up. Continued the implementation by closing the UI/setup gap rather than changing the lower-level runtime code again.

What changed:

- Mini Settings first-run onboarding now has explicit checks for:
  - Screen OCR / Screen Recording permission.
  - Desktop automation via Hermes Computer Use or OpenClaw Peekaboo.
  - Feishu workflow readiness via `lark-cli`.
- Local Tools setup actions are now executable from the UI after approval.
  - Approved `setup` capabilities render a `Run` action next to `Revoke`.
  - The action calls `window.api.localTools.execute({ toolId, capabilityId })` and shows success/error notices.
- Added an OpenClaw Peekaboo setup capability.
  - `openclaw skills info peekaboo` confirmed Peekaboo is present but needs setup because the `peekaboo` binary is missing.
  - Sarah now exposes `openclaw-peekaboo.setup`.
  - Its executor opens Terminal with `openclaw skills info peekaboo` and prints the install hint `brew install peekaboo`.
- Kept Hermes Computer Use setup behind explicit user approval.
  - Existing `hermes-computer-use.setup` still opens `hermes computer-use install` in Terminal.

Important decisions and tradeoffs:

- Setup actions are not run automatically. The UI requires approval first, then a separate Run click. This keeps desktop-control and installer flows explicit.
- OpenClaw does not expose a direct `skills setup peekaboo` command. The safest setup action is to open the official skill info and show the install hint rather than inventing a hidden install path.
- The first-run checklist now treats desktop automation and Feishu as optional warnings, not hard blockers, so users can still finish onboarding with basic dictation.

Verification:

- `CI=true pnpm -s verify:mini` passed 98/98 checks.
- `node --experimental-strip-types --check scripts/verify-mini-integration.ts` passed.
- Scoped `git diff --check` passed for the files changed in this follow-up.
- `pnpm exec eslint src/renderer/mini-settings/index.ts scripts/verify-mini-integration.ts` stalled without output in the local toolchain and was stopped.

Known bugs / open questions:

- `cua-driver` is still not installed, so Hermes Computer Use remains setup-ready but not active.
- `peekaboo` binary is still not installed, so OpenClaw Peekaboo remains setup-ready but not active.
- Full in-app click-through of the new setup buttons still needs a packaged/dev Electron session; static IPC/API coverage is in place.

Concrete next steps:

- In a live Sarah session, open Mini Settings, approve and run `hermes-computer-use.setup`, then grant macOS permissions and recheck `hermes computer-use status`.
- Install Peekaboo with Homebrew if approved, then re-run `openclaw skills info peekaboo` and `openclaw skills list`.
- Add a dedicated Feishu “visible OCR/current page -> doc/message” action once lark-cli command schemas are finalized.

### 2026-05-15 Computer Use Dependency Installation

Continued after adding the setup UI. User had said to continue, and the previously identified blockers were external dependencies for desktop automation.

What changed locally:

- Installed Hermes Computer Use backend with `hermes computer-use install`.
  - Installed `cua-driver 0.1.9`.
  - Installed `/Applications/CuaDriver.app`.
  - Symlinked `/Users/chaosmac/.local/bin/cua-driver`.
  - The installer also linked CuaDriver skills into Claude Code, Codex, OpenClaw, and OpenCode skill directories.
- Started CuaDriver daemon with `open -n -g -a CuaDriver --args serve`.
  - Confirmed process is running as `/Applications/CuaDriver.app/Contents/MacOS/cua-driver serve`.
  - `hermes computer-use status` now reports `cua-driver: installed at /Users/chaosmac/.local/bin/cua-driver (0.1.9)`.
  - `cua-driver list_apps` succeeds and returns installed macOS apps, including Telegram, Claude, Codex, ChatGPT, WeChat, Sarah, and others.
- Installed OpenClaw Peekaboo dependency with `brew install peekaboo`.
  - Installed `peekaboo 3.2.0`.
  - `peekaboo --version` returns `Peekaboo 3.2.0`.
  - `openclaw skills info peekaboo` now reports `peekaboo ✓ Ready`.
  - `openclaw skills list --eligible` now reports `Skills (66/66 ready)`.

Important decisions and tradeoffs:

- Installing these dependencies required explicit approval because they write outside the repo and affect macOS privacy permissions.
- `cua-driver check_permissions` currently hangs with a Swift continuation warning even after the daemon starts, so do not use it as a reliable verification command in this environment. Use `hermes computer-use status`, daemon process presence, and `cua-driver list_apps` for smoke verification.
- Peekaboo still needs Screen Recording permission for screenshots. Homebrew explicitly warned to enable Screen Recording for the Terminal application.

Verification:

- `hermes computer-use status` passed and reports installed `cua-driver`.
- `cua-driver --version` passed with `0.1.9`.
- `cua-driver list_apps` passed.
- `peekaboo --version` passed with `3.2.0`.
- `openclaw skills info peekaboo` passed and reports ready.
- `openclaw skills list --eligible` passed and reports all eligible skills ready.

Known bugs / open questions:

- macOS Accessibility and Screen Recording permission prompts may still require manual confirmation by the user for CuaDriver.app, Terminal, Sarah, or Peekaboo depending on which process performs capture/control.
- OpenClaw still prints stale plugin warnings for `openclaw-weixin`, `dingtalk`, `feishu`, and `acpx`; desktop automation is ready despite those warnings.

Concrete next steps:

- Open Sarah Mini Settings and confirm Hermes Computer Use / OpenClaw Peekaboo move from setup to ready after the 15-second local tool cache refresh.
- If desktop capture fails, grant Screen Recording to Terminal, Sarah, CuaDriver, and Peekaboo in macOS System Settings.
- Add a first-class Feishu write action now that the screen/desktop context layer is much stronger.

### 2026-05-15 Feishu Visible Context Save Follow-up

User asked “剩下还有什么要做的，你都去做”. The remaining concrete product gap was the first-class Feishu write workflow for captured screen/current-page context.

What changed:

- Added a `lark-cli.visible-context.create-doc` local tool executor.
  - It creates a Markdown Feishu/Lark document from Sarah's captured app name, window title, URL, OCR text, user request, and Sarah answer.
  - It uses `lark-cli docs +create --title ... --markdown ...` because the current installed `lark-cli` v2 create path accepts content but does not preserve a document title in dry-run output.
  - It parses returned JSON/URLs so the Action Timeline can show the created document link when available.
- Added a `visible-context.create-doc` write capability to the Feishu/Lark local tool.
- Added a “存飞书” action in the Command/Quick Ask answer overlay.
  - First click grants one-time approval and changes the button to “确认飞书”.
  - Second click creates the Feishu document.
  - The button is disabled while Sarah is streaming so it saves a settled captured context/answer.
- Styled the new Feishu action in the answer overlay and expanded the actionbar to five stable columns.
- Fixed a verification-script hang by dynamically importing `@electron/asar` only for non-CI packaged checks.
- Extended `scripts/verify-mini-integration.ts` to cover the Feishu visible-context capability, executor, overlay button, and styling.

Important decisions and tradeoffs:

- The Feishu action lives in the answer overlay, not Mini Settings. Mini Settings itself becomes the foreground app when opened, so it cannot reliably represent the original Telegram/browser/PDF context the user wanted to save.
- Feishu writes require explicit approval and confirmation. This is intentionally stricter than a passive copy/export action because it writes to an external workspace.
- The current `lark-cli` version reports `1.0.31` available while local is `1.0.19`; do not assume v2 create title semantics until the CLI is upgraded and retested.

Verification:

- `lark-cli docs +create --dry-run --title 'Sarah Capture Dry Run' --markdown ...` passed and showed the expected `create-doc` request with both `title` and `markdown`.
- `CI=true pnpm -s verify:mini` passed 103/103 checks.
- `node --experimental-strip-types --check scripts/verify-mini-integration.ts` passed.
- Scoped `git diff --check` passed for the Feishu/local-tool/overlay/verification files changed in this follow-up.

Known bugs / open questions:

- `pnpm -s typecheck` and scoped `pnpm exec eslint ...` both stalled locally with their child processes at 0% CPU and were terminated. This appears to be a local toolchain hang, not an emitted source error, but it still needs a clean rerun before release.
- The Feishu create action was verified with `--dry-run`; a live document creation should be tested in the app once the user is comfortable creating a real test doc.
- `lark-cli auth status` previously showed `tokenStatus: needs_refresh`; the CLI may auto-refresh during a real create, but failures should surface in the Action Timeline.

Concrete next steps:

- In a live Sarah session, trigger Command or Quick Ask over a browser/Telegram/PDF page, wait for the answer, click “存飞书”, then “确认飞书”, and confirm the created document contains source metadata, OCR text, and the answer.
- Upgrade `lark-cli` from 1.0.19 to 1.0.31 and retest whether v2 create can preserve document titles; switch to v2 if title support is confirmed.
- Rerun `pnpm -s typecheck` and scoped ESLint in a fresh terminal/session to confirm the local stall is gone.

### 2026-05-15 Prompt Sound, OCR Context, and Local Toolchain Debug

User reported three issues: no audible prompt sound, Sarah still saying it cannot see the current Codex page, and local `pnpm -s typecheck` / scoped ESLint hangs.

What changed:

- Strengthened voice cue playback in `voice-mode-manager.ts`.
  - Start/stop now call Electron `shell.beep()` first, then play the macOS `Ping.aiff` / `Pop.aiff` cue through `afplay` at volume `0.9`.
  - This makes the cue audible even when `afplay` succeeds silently or too quietly.
- Strengthened screenshot OCR context capture in `context-capture.service.ts`.
  - Sarah no longer skips screenshot capture for Electron's soft `not-determined` screen status; it only skips on hard `denied` / `restricted`.
  - macOS `screencapture` is now treated as the source of truth because it works locally even when Electron reports an ambiguous status.
  - OCR now compiles `scripts/ocr-image.swift` into a cached `~/.sarah/ocr-image` binary and reuses it, avoiding Swift interpreter cold-start timeouts.
- Pinned the project away from the broken local TypeScript 6.x CLI state.
  - `typescript` is now `^5.9.3`.
  - Added an explicit `@types/node` devDependency so TypeScript/ESLint do not float through unrelated transitive Node type packages.
- Repaired two visibly corrupt local dependency folders during diagnosis: `typescript` and `@eslint/eslintrc`.

Important decisions and tradeoffs:

- The prompt sound fix requires restarting/rebuilding the running Sarah app; an already-running Electron process will still have the previous code loaded.
- Do not rely on `systemPreferences.getMediaAccessStatus('screen')` alone for screen context. In this environment it can under-report access while `screencapture` succeeds.
- The local `node_modules` tree appears corrupted / FileProvider-affected. Targeted package repair helped individual failures, but it is not a substitute for a clean dependency reinstall.

Verification:

- `/usr/bin/afplay -v 1 /System/Library/Sounds/Ping.aiff` succeeds locally.
- Direct `screencapture -x -m ...` succeeds and creates a 3840x2160 PNG.
- Compiled `~/.sarah/ocr-image` successfully OCRed the live screen.
- `swiftc -typecheck scripts/ocr-image.swift` passed.
- `node_modules/.bin/tsc --version` returns `Version 5.9.3`.
- `CI=true node --experimental-strip-types --no-warnings scripts/verify-mini-integration.ts` passed 103/103 checks.
- Scoped `git diff --check` passed for the prompt sound, OCR, package, and lockfile changes.

Known bugs / open questions:

- `pnpm -s typecheck` still produces no output and was terminated by a 45s watchdog. This is currently a local toolchain/dependency-tree stall, not a normal TypeScript diagnostic.
- Scoped ESLint first failed on an invalid `@eslint/eslintrc/package.json`; after repairing that package it still stalled and was terminated by a watchdog.
- A full `node_modules` reinstall is still needed before release. Running install/move operations inside this Desktop/FileProvider-backed project path has also shown hangs, so the cleanest path is to reinstall dependencies from a fresh terminal or from a non-FileProvider clone/worktree.

Concrete next steps:

- Restart Sarah and test all three mode hotkeys for audible start/stop cues.
- In live Sarah, trigger Command/Quick Ask while Codex/Chrome/Telegram is frontmost and confirm Action Timeline shows screenshot/OCR context instead of “no screenshot/no URL”.
- Clean-reinstall dependencies (`node_modules`) in a stable local path, then rerun `pnpm -s typecheck` and scoped ESLint before shipping.

### 2026-05-15 Mini Hotkey Customization and Runtime Selector Follow-up

User showed the Mini Settings hotkey/runtime cards and asked for customizable buttons, automatic hotkey conflict checks, conflict warnings, and clearer support for OpenAI Codex CLI / Claude Code CLI in addition to OpenClaw and Hermes.

What changed:

- Added a main-process voice-trigger conflict check.
  - New IPC channel: `claw-desk:check-voice-trigger`.
  - `HotkeyManager.apply()` now validates the voice trigger before saving/applying it, so the renderer cannot bypass conflict checks.
  - The check rejects invalid custom keycodes, regular typing keys, Space, Esc, Return, Tab, Backspace, left modifiers, and other unsafe keys that would conflict with normal macOS/app input.
- Added Mini Settings custom trigger UI.
  - Preset buttons remain for stable defaults: Right Alt, Right Cmd, F18, F19.
  - Users can now click `Record key` to capture a supported hardware key from the Mini window.
  - Users can also enter a raw uiohook keycode and click `Use`.
  - The UI calls the new conflict-check IPC before saving and shows an immediate warning/error notice when a key is unsafe.
- Made the Mini runtime selector explicitly four-runtime.
  - The card now always shows OpenClaw, Hermes, Codex CLI, and Claude Code slots.
  - If a runtime is absent from backend detection, the renderer still displays a Missing/Install card so Codex/Claude do not visually disappear.
  - Existing backend runtime detection and connect/setup paths already include Codex and Claude; this pass makes that capability visible in the Mini card.
- Extended `verify-mini-integration.ts` checks for voice trigger conflict checking, custom hotkey recording UI, the four-runtime selector, and the new IPC channel.

Important decisions and tradeoffs:

- Custom key capture intentionally maps only known safe DOM codes to uiohook keycodes in the UI. Unknown hardware keys can still be configured through the raw keycode field.
- Regular letters/numbers are blocked because Sarah's trigger is global; allowing them would break normal typing.
- Codex CLI and Claude Code are treated as selectable agent runtimes, not desktop Computer Use providers. Desktop control remains Sarah/Hermes/OpenClaw tool territory.

Verification:

- `./node_modules/.bin/esbuild src/renderer/mini-settings/index.ts --bundle --platform=browser --format=esm --outfile=/tmp/sarah-mini-settings.js --loader:.css=empty` passed.
- `node --experimental-strip-types --check` passed for `hotkey-manager.ts`, `claw-desk.handler.ts`, `preload.ts`, `channels.ts`, `ipc-api.ts`, and `verify-mini-integration.ts`.
- `CI=true node --experimental-strip-types --no-warnings scripts/verify-mini-integration.ts` passed 107/107 checks.
- Scoped `git diff --check` passed for the hotkey/runtime follow-up files.

Known bugs / open questions:

- Main-process esbuild bundle checks still stalled in this local dependency tree and were killed; this is the same `node_modules` / FileProvider corruption problem documented above.
- A live Mini Settings interaction test still requires restarting/rebuilding Sarah so the running app loads the new renderer and IPC code.

Concrete next steps:

- Restart/rebuild Sarah and test: preset switch, `Record key`, raw keycode apply, unsafe letter/Space rejection, and Codex/Claude runtime cards.
- After dependency cleanup, rerun full `pnpm -s typecheck`, scoped ESLint, and packaging.

### 2026-05-15 Chinese UI, Permission Probe, and Packaging Debug

User tested the app and reported the visible app still showed only two runtime choices, English UI, a false `Missing Screen` warning despite permissions being granted, confusing Dictate/Command color/meaning, a noisy Local Tools block, and voice actions not answering.

What changed:

- Local dependency repair:
  - Renamed the corrupt dependency tree to `node_modules.broken-1778871367`.
  - Reinstalled dependencies with `pnpm install --ignore-scripts`; install completed in 4.1s and no longer hangs during resolution.
- Fixed the real ASR build error exposed by packaging:
  - Restored `src/main/services/asr/lib/config.ts`.
  - It now exports `loadASRConfig`, `isASRConfigured`, `ConfigurationError`, and `ASREnvConfig`, delegating to the centralized credential/env resolver.
- Fixed the false screen-permission warning at the status layer:
  - Added `getScreenRecordingStatusForUi()` in `main.ts`.
  - The UI now probes real `screencapture -x -m` capability with a short cache and treats successful capture as `granted`, matching the OCR capture behavior.
  - Startup permission notification also uses this probe, so Sarah should stop reporting `Missing Screen` when screenshot capture works.
- Localized the primary UI surfaces to Chinese:
  - Menubar popover labels now use `听写 / 命令 / 快问`, Chinese permission/status rows, Chinese footer actions, and Chinese loading/error copy.
  - Mini Settings primary labels, runtime card, hotkey card, health card, action buttons, first-run checklist, and notices were converted to Chinese.
- Clarified primary actions:
  - Menubar popover now shows three actions: `听写`, `命令`, `快问`.
  - The popover hides itself after starting a voice action so Sarah does not remain the frontmost app and pollute Command/Quick Ask context capture.
  - Blue remains the primary/default action (`听写`); agent actions are secondary.
- Reduced Local Tools visual weight:
  - Local Tools is now a collapsed `高级集成` section in Mini Settings.
  - Copy explains these are OpenClaw/Hermes/Obsidian/Feishu external integrations and are not needed for normal dictation/asking.
- Runtime selector:
  - Mini Settings still forces four slots through `runtimeOptions`: OpenClaw, Hermes, Codex CLI, Claude Code.
  - If a runtime is missing from backend detection, the renderer creates a Missing/Install card so it remains visible.

Important decisions and tradeoffs:

- `Screen Recording` status from Electron alone is not reliable enough on this machine. A real `screencapture` probe is the practical UI truth.
- `Local Tools` are useful for external write/control capabilities, but they should not dominate the daily control surface.
- Command means “send my spoken instruction plus current context/screen to the selected agent runtime”; Quick Ask means “ask the runtime a question without writing into the current app”; Dictation means “turn speech into text and insert/copy it”.

Verification:

- `CI=true node --experimental-strip-types --no-warnings scripts/verify-mini-integration.ts` passed 109/109 before a later FileProvider `ECANCELED` read appeared in a subsequent rerun.
- `git diff --check` passed for the UI/status files touched in this follow-up.
- Production packaging progressed past the previous dependency stall and reached actual Vite/Rollup compilation.
- Packaging exposed and then confirmed the ASR config export issue; that file was restored.

Known bugs / open questions:

- `pnpm run package` still does not complete reliably in this Desktop/FileProvider-backed working tree. After dependency reinstall it progressed into Vite builds, but later runs either timed out in main target build or stalled after the script header.
- `pnpm -s typecheck` and scoped ESLint still time out without diagnostics in this directory even after dependency reinstall.
- There is one unkillable stale esbuild process (`pid 18515`, `U` state) from an earlier stuck bundle command; it no longer has children but will likely need a reboot to disappear.
- Because packaging did not finish, the installed/running Sarah app is still expected to show the old UI until a successful package/install run is completed.

Concrete next steps:

- Move or clone the project to a non-Desktop, non-FileProvider path and run `pnpm install`, `pnpm -s typecheck`, scoped ESLint, `pnpm run package`, then `pnpm run install:app`.
- After successful install, live-test: four runtime cards, Chinese popover/settings, no false Missing Screen, three voice actions, and Command/Quick Ask answer overlay.

### 2026-05-16 Clean Package, Install, and GitHub Publish Prep

User asked to rebuild/package Sarah, reinstall it, restart/run the packaged app, test the result, then push the completed work to GitHub and merge it.

What changed:

- Created/used a clean non-Desktop clone at `/Users/chaosmac/Code/sarah-desk-build` because the Desktop/FileProvider working tree had stale hung esbuild state and unreliable filesystem reads.
- Applied the current Sarah patch set to the clean clone and installed dependencies there with `pnpm install --ignore-scripts`.
- Fixed clean-clone packaging by making `.env` an optional Forge `extraResource`.
  - `forge.config.ts` now always bundles `assets/tray-icon.png`.
  - It bundles `.env` only when a local `.env` exists, so fresh clones and CI no longer fail with `ENOENT: lstat './.env'`.
- Fixed packaged-app startup noise when `.env` is absent.
  - `main.ts` now checks `fs.existsSync(envPath)` before calling `dotenv.config`.
  - Missing packaged `.env` is logged as an intentional optional skip, not an ERROR.
- Fixed TypeScript 5.9 typecheck blockers found in the clean clone.
  - `tsconfig.json` now uses `"ignoreDeprecations": "5.0"` instead of the unsupported `"6.0"`.
  - `AgentService` narrows child-process stdout/stderr before registering listeners.
  - Removed an unused Claude helper that produced scoped ESLint warning noise.

Important decisions and tradeoffs:

- `.env` remains local/private and is not required for packaging. Users can still configure credentials through the app settings or provide a local `.env` when packaging for themselves.
- The install script signs with the stable Apple Development identity. The first clean-clone install reset TCC because `.last-install-authority` did not exist in that clone; the next install detected the same identity and kept TCC grants.
- The clean clone is now the reliable build/publish source. The Desktop working tree still has a stale unkillable esbuild process from earlier and should not be used for final packaging until the machine is restarted or that state clears.

Verification:

- `pnpm run install:app` completed successfully in `/Users/chaosmac/Code/sarah-desk-build`.
- Installed app: `/Users/chaosmac/Applications/Sarah.app`.
- App was signed as `Authority=Apple Development: 3043755156@qq.com (P27KG3UBWZ)`.
- Final reinstall kept TCC grants because the signing authority matched the previous install.
- `pnpm -s typecheck` passed in the clean clone.
- Scoped ESLint passed for `src/main.ts`, `forge.config.ts`, `src/main/services/agent/agent.service.ts`, `src/main/services/push-to-talk/voice-mode-manager.ts`, `src/main/services/hotkey/hotkey-manager.ts`, `src/renderer/mini-settings/index.ts`, and `src/renderer/menubar-popover/index.tsx`.
- `CI=true node --experimental-strip-types --no-warnings scripts/verify-mini-integration.ts` passed 109/109.
- `swiftc -typecheck scripts/ocr-image.swift` passed.
- Packaged smoke test passed with `SARAH_SMOKE_TEST=1 /Users/chaosmac/Applications/Sarah.app/Contents/MacOS/Sarah`.
  - `tray-created`: pass.
  - `legacy-debug-console-hidden`: pass.
  - `recorder-window`: pass.
  - `recorder-ipc`: pass.
  - Startup permission summary reported `screenRecGranted: true`.

Known bugs / open questions:

- The clean smoke test validates startup, tray/window wiring, recorder hidden window, IPC, and screen permission probe. It does not physically press the user’s global hotkeys or verify audible output through speakers.
- If the user lost permissions after the first clean-clone install reset, re-grant once in macOS settings; subsequent installs signed by the same identity should keep grants.

Concrete next steps:

- Commit this clean-clone state on a feature branch, push it to GitHub, open a PR, and attempt to merge it automatically.
- If GitHub branch protection blocks immediate merge, leave the PR URL and exact blocking check/status for the next agent or user.
