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
