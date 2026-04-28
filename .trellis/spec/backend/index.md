# Backend Development Guidelines

> Best practices for Electron main process development in open-typeless.

---

## Overview

open-typeless is a macOS voice input tool. The backend (main process) handles:
- Global keyboard monitoring (Push-to-Talk)
- Bluetooth HID device support
- Volcengine ASR WebSocket client
- Text insertion to active applications
- macOS permission management

---

## Guidelines Index

### Core Features

| Guide | Description | Priority |
|-------|-------------|----------|
| [Global Keyboard Hooks](./global-keyboard-hooks.md) | uiohook-napi for Push-to-Talk detection | HIGH |
| [Bluetooth HID Device](./bluetooth-hid-device.md) | node-hid for Bluetooth remote control | HIGH |
| [Text Input](./text-input.md) | @xitanggg/node-insert-text for text insertion | HIGH |
| [macOS Permissions](./macos-permissions.md) | Input Monitoring, Accessibility, Microphone | HIGH |

### Architecture

| Guide | Description | Priority |
|-------|-------------|----------|
| [Directory Structure](./directory-structure.md) | Domain-driven backend organization | HIGH |
| [IPC Handler Registration](./ipc-handler-registration.md) | IPC registration chain patterns | HIGH |
| [Error Handling](./error-handling.md) | When to throw vs return errors | HIGH |

### Quality

| Guide | Description | Priority |
|-------|-------------|----------|
| [Type Safety](./type-safety.md) | Zod schemas, discriminated unions | MEDIUM |
| [Logging](./logging.md) | Structured logging with electron-log | MEDIUM |

---

## Quick Reference

### Key Dependencies

| Package | Purpose |
|---------|---------|
| `uiohook-napi` | Global keyboard/mouse hooks |
| `node-hid` | USB/Bluetooth HID device access |
| `@xitanggg/node-insert-text` | Native text insertion |
| `electron-log` | Structured logging |

### Required macOS Permissions

| Permission | Required For |
|------------|--------------|
| Input Monitoring | Keyboard hooks (uiohook-napi) |
| Accessibility | Text insertion |
| Microphone | Audio recording for ASR |

---

**Language**: All documentation is in **English**.
