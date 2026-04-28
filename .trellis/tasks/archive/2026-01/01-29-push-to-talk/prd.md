# Push-to-Talk Global Keyboard Hook

## Goal

实现全局键盘监听，按住 Right Option 键开始 ASR 录音，松开后自动将识别结果插入到光标位置。

## Prerequisites

依赖已完成的模块：
- [x] asr-infrastructure (Batch 1)
- [x] asr-volcengine-client (Batch 2)
- [x] asr-audio-recorder (Batch 2)
- [x] asr-floating-window (Batch 2)
- [x] asr-integration (Batch 3)

## Requirements

### 1. Keyboard Hook Service (`src/main/services/keyboard/`)

使用 `uiohook-napi` 实现全局键盘监听：

```typescript
// keyboard.service.ts
import { uIOhook, UiohookKey } from "uiohook-napi";

export class KeyboardService {
  private isKeyHeld = false;
  private onKeyDown?: () => void;
  private onKeyUp?: () => void;

  register(onKeyDown: () => void, onKeyUp: () => void): void;
  unregister(): void;
}

export const keyboardService = new KeyboardService();
```

**配置：**
- 触发键：`UiohookKey.AltRight` (Right Option on macOS)
- 防抖：50ms
- 最小录音时长：200ms

### 2. Text Insertion Service (`src/main/services/text-input/`)

使用 `@xitanggg/node-insert-text` 实现文字插入：

```typescript
// text-input.service.ts
import { insertText } from "@xitanggg/node-insert-text";

export class TextInputService {
  insert(text: string): { success: boolean; error?: string };
  checkPermission(): boolean;
}

export const textInputService = new TextInputService();
```

### 3. Push-to-Talk Orchestrator (`src/main/services/push-to-talk/`)

协调键盘、ASR、文字插入：

```typescript
// push-to-talk.service.ts
export class PushToTalkService {
  private isActive = false;

  initialize(): void;
  dispose(): void;

  private handleKeyDown(): void {
    // 1. Start ASR recording
    // 2. Show floating window
  }

  private handleKeyUp(): void {
    // 1. Stop ASR recording
    // 2. Get final result
    // 3. Insert text at cursor
    // 4. Hide floating window
  }
}

export const pushToTalkService = new PushToTalkService();
```

### 4. Native Module Configuration

**vite.main.config.ts:**
```typescript
external: [
  "uiohook-napi",
  "@xitanggg/node-insert-text",
],
```

**forge.config.ts:**
```typescript
const nativeModules = [
  "uiohook-napi",
  "@xitanggg/node-insert-text",
  // Platform-specific packages
];
```

### 5. Permission Handling

- **Input Monitoring**: uiohook-napi 需要
- **Accessibility**: text-input 需要

```typescript
// permissions.service.ts
export function checkRequiredPermissions(): {
  inputMonitoring: boolean;
  accessibility: boolean;
};

export function openPermissionSettings(type: string): void;
```

## E2E Flow

```
1. App 启动 → 初始化 PushToTalkService
2. 用户在任意应用按住 Right Option
3. KeyboardService 检测到 keydown → 触发 onKeyDown
4. PushToTalkService.handleKeyDown():
   - 调用 asrService.start()
   - 显示悬浮窗
5. Renderer 开始录音，音频流经 IPC 发送到 Main
6. ASR 实时返回识别结果，显示在悬浮窗
7. 用户松开 Right Option
8. KeyboardService 检测到 keyup → 触发 onKeyUp
9. PushToTalkService.handleKeyUp():
   - 调用 asrService.stop() 获取最终结果
   - 调用 textInputService.insert(result)
   - 隐藏悬浮窗
```

## Acceptance Criteria

- [ ] 按住 Right Option 开始录音，悬浮窗显示
- [ ] 松开 Right Option 停止录音，文字插入到光标位置
- [ ] 悬浮窗实时显示识别结果
- [ ] 录音过短 (<200ms) 时忽略
- [ ] 权限缺失时给出提示
- [ ] `pnpm lint` 通过
- [ ] `pnpm typecheck` 通过

## Technical Notes

- uiohook-napi 在开发模式下继承 Terminal 的权限
- 需要防止键盘 auto-repeat 导致的重复事件
- 注意在 app 退出时正确清理 uIOhook
