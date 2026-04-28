<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

Use the `/trellis:start` command when starting a new session to:
- Initialize your developer identity
- Understand current project context
- Read relevant guidelines

Use `@/.trellis/` to learn:
- Development workflow (`workflow.md`)
- Project structure guidelines (`spec/`)
- Developer workspace (`workspace/`)

Keep this managed block so 'trellis update' can refresh the instructions.

<!-- TRELLIS:END -->

# Project Rules

## Workflow Entry

- Start from `.trellis/workflow.md`.
- Initialize Trellis developer identity before substantial work.
- Read the relevant `.trellis/spec/` documents before changing code.

## Memory Rule

- `CLAUDE.md` is the single handoff memory file and the single source of truth for current project architecture.
- After every meaningful task, update `/Users/chaosmac/Desktop/open-typeless/CLAUDE.md`.
- Each update must record:
  - what the user asked for
  - what changed
  - important decisions and tradeoffs
  - known bugs or open questions
  - concrete next steps for the next agent
- If the task involved environment cleanup or local external operations that affect workflow, record that in `CLAUDE.md` too.

## Scope Rule

- Do not maintain current architecture truth in `AGENTS.md`.
- Do not put hotkey mappings, mode behavior, state machine details, or window behavior here.
- Keep those details only in `CLAUDE.md`.
