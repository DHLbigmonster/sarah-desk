# Sarah

> The Siri you actually wanted.

Sarah is a macOS menu bar voice assistant for dictation, quick answers, and local agent workflows.

## What It Does

- Voice dictation into the focused app
- Quick voice questions from a compact overlay
- Command mode for local agent actions
- Menu bar control center for runtime status and diagnostics
- Packaged macOS app with microphone, input monitoring, and accessibility permission flows

## Requirements

- macOS 12+
- Node.js 18+
- npm or pnpm
- Volcengine ASR credentials for speech recognition

## Setup

```bash
npm install
cp .env.example .env
```

Configure `.env` with the required ASR and lightweight model credentials.

## Development

```bash
npm start
npm run typecheck
npm run lint
npm test
```

## Package And Install

```bash
npm run install:app
```

The installed app is:

```text
~/Applications/Sarah.app
```

The bundle identifier is:

```text
com.sarah.app
```

After installing a new bundle, macOS may require fresh permissions for microphone, input monitoring, and accessibility.

## Verification

```bash
npm run verify:mini
```

This checks source wiring, packaged app contents, native modules, and a packaged smoke test.

## Project Structure

```text
src/main/                  Electron main process, services, IPC, windows
src/renderer/mini-settings Mini control center renderer
src/renderer/src/modules   Floating HUD and answer overlay renderers
src/shared                 Shared IPC constants and types
scripts/                   Packaging, launch, and integration verification scripts
```

## License

MIT
