# OpenTypeless Mini Scope

Last updated: 2026-04-25

## Product Direction

OpenTypeless is now scoped as `OpenTypeless Mini`.

The app is no longer prioritizing a full desktop workspace UI or a ClawDesk-style
multi-page shell. The default experience should be a lightweight macOS menubar
entry with global voice hotkeys and a stable packaged app.

## Priority Order

- `P0`: Recording main chain
- `P1`: Packaged app integration
- `P2`: OpenClaw Gateway connection
- `P3`: Mini Settings
- `P4`: Legacy ClawDesk UI cleanup

## Must Keep

- Global hotkeys
  - `Right Ctrl`: Dictation toggle
  - `Right Ctrl + Shift`: Command mode
  - `Right Ctrl + Space`: Quick Ask
- Recorder pipeline
  - `recorderWindow`
  - preload / renderer bridge
  - ASR IPC
  - audio chunk transport
  - dictation refinement
  - text insertion
- HUD / lightweight windows
  - floating HUD
  - lightweight agent overlay for Command / Quick Ask
- Menubar / tray lifecycle

## Mini Runtime Entry

Default startup should be Mini mode:

- app starts into the macOS menu bar
- app does not auto-open the legacy ClawDesk window
- legacy UI remains reachable only as an explicit fallback / debug surface

## Legacy / Deprecated Surface

These modules remain in the repo temporarily, but are not the product priority:

- `src/main/windows/claw-desk.ts`
- `src/renderer/clawdesk/**`
- ClawDesk sidebar / sessions / workspace / models / multi-page shell

They may still be used as:

- fallback debug UI
- temporary settings surface
- migration bridge while Mini Settings is being built

## Safety Rules During Shrink

- Do not delete recording-chain files first.
- Do not remove `recorderWindow`, `ASR`, `keyboard`, `IPC`, or shared preload wiring.
- Do not do repository-wide rollback to recover old behavior.
- Prefer hiding or de-prioritizing legacy UI over deleting it until Mini mode is fully proven.

## Current Migration Principle

When there is a tradeoff, prefer protecting:

1. voice hotkeys
2. packaged-app stability
3. recorder / ASR reliability
4. dictation insertion reliability

Only after those are stable should the project spend effort replacing or deleting
the legacy ClawDesk shell.
