# Shared Development Guidelines

> Cross-cutting concerns for both main and renderer processes.

---

## Overview

Shared guidelines cover:
- Project setup and configuration
- Native module packaging
- TypeScript conventions

---

## Guidelines Index

| Guide | Description | Priority |
|-------|-------------|----------|
| [pnpm Electron Setup](./pnpm-electron-setup.md) | pnpm configuration for Electron + native modules | HIGH |
| [Native Module Packaging](./native-module-packaging.md) | Packaging uiohook-napi, node-hid with Electron Forge | HIGH |
| [TypeScript](./typescript.md) | TypeScript best practices | MEDIUM |

---

## Quick Reference

### Critical pnpm Setting

```ini
# .npmrc
shamefully-hoist=true
```

Required for native modules to work correctly with Electron.

### Native Modules in This Project

| Module | Requires |
|--------|----------|
| `uiohook-napi` | Rebuild for Electron, external in Vite |
| `node-hid` | Rebuild for Electron, external in Vite |
| `@xitanggg/node-insert-text` | External in Vite |

---

**Language**: All documentation is in **English**.
