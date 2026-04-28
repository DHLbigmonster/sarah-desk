# Open-Typeless MVP

## Goal
开发一个 macOS 语音输入工具，复刻 Typeless 的核心功能，使用火山引擎 ASR 实现高质量中文语音识别。

## Background
- **产品**: Typeless (https://www.typeless.com/) - AI 语音转文字工具
- **技术栈**: Electron + React + TypeScript
- **ASR 服务**: 火山引擎 (Volcengine) BigModel ASR V3

---

## Core Features

### P0 - Must Have (MVP)

#### 1. Push-to-Talk 语音输入
- **按住说话**: 按住 Right Option (⌥) 键开始录音
- **松开粘贴**: 松开按键自动将识别文字插入到光标位置
- **实时显示**: 悬浮窗显示录音状态和实时转写文字

#### 2. 悬浮窗 UI
- 小巧的悬浮窗口 (类似 macOS 听写)
- 显示状态: Idle → Listening → Processing → Done
- 实时显示 interim + final 识别结果
- 支持拖动位置

#### 3. 火山引擎 ASR 集成
- WebSocket 连接到 Volcengine ASR
- 支持流式语音识别
- 处理 interim (中间结果) 和 final (最终结果)

### P1 - Should Have

#### 4. 蓝牙遥控器支持
- 使用 node-hid 监听蓝牙遥控器 (自拍杆等)
- 第一次按 → 开始录音
- 第二次按 → 停止并粘贴
- 双击 → 发送 Enter 键

#### 5. 系统托盘
- 托盘图标显示状态
- 右键菜单: 设置、退出
- 显示当前快捷键

### P2 - Nice to Have

#### 6. 设置界面
- 自定义触发键
- ASR 语言设置
- 悬浮窗位置记忆

#### 7. 历史记录
- 保存最近的转写记录
- 支持复制历史文本

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      User Input                              │
│  Hold Right Option / Bluetooth Remote                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                  Main Process                                │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐     │
│  │ uiohook-napi│  │  node-hid   │  │ Floating Window  │     │
│  │ 键盘监听     │  │ 蓝牙遥控器  │  │ 管理             │     │
│  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘     │
│         │                │                   │               │
│         └────────────────┴───────────────────┘               │
│                          │                                   │
│  ┌───────────────────────▼──────────────────────────────┐   │
│  │              Volcengine ASR Client                    │   │
│  │  WebSocket → wss://openspeech.bytedance.com          │   │
│  │  实时语音识别 (V3 BigModel API)                       │   │
│  └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                Floating Window (Renderer)                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  ● Listening...                                      │    │
│  │  ─────────────────────────────────────────────────   │    │
│  │  你好世界|                                           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│           @xitanggg/node-insert-text                         │
│           直接插入文字到光标位置 (不污染剪贴板)               │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Project Setup
- [ ] Electron + Vite + React 项目初始化
- [ ] pnpm 配置 (shamefully-hoist for native modules)
- [ ] 目录结构搭建 (按 spec 规范)
- [ ] TypeScript 配置
- [ ] ESLint + Prettier 配置

### Phase 2: Core Infrastructure
- [ ] IPC 通信层搭建
- [ ] 日志系统 (electron-log)
- [ ] 错误处理框架
- [ ] macOS 权限检查与请求

### Phase 3: 键盘监听
- [ ] uiohook-napi 集成
- [ ] Right Option 键检测
- [ ] 按住/松开状态管理
- [ ] 焦点切换处理

### Phase 4: 悬浮窗 UI
- [ ] BrowserWindow 创建 (transparent, alwaysOnTop)
- [ ] React 组件开发
- [ ] 状态显示 (Idle/Listening/Processing)
- [ ] 实时文字显示
- [ ] 拖动支持

### Phase 5: ASR 集成
- [ ] Volcengine ASR WebSocket 客户端
- [ ] 音频录制 (node-record-lpcm16 或 naudiodon)
- [ ] 音频流发送
- [ ] 识别结果处理 (interim/final)

### Phase 6: 文字插入
- [ ] @xitanggg/node-insert-text 集成
- [ ] Accessibility 权限检查
- [ ] 插入逻辑实现
- [ ] 错误处理与降级

### Phase 7: 打包发布
- [ ] Electron Forge 配置
- [ ] 原生模块打包配置
- [ ] macOS 签名配置
- [ ] DMG 打包

---

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| electron | ^28.0.0 | 桌面应用框架 |
| electron-forge | latest | 打包工具 |
| uiohook-napi | ^1.5.0 | 全局键盘监听 |
| node-hid | ^3.0.0 | 蓝牙 HID 设备 |
| @xitanggg/node-insert-text | ^1.0.0 | 文字插入 |
| electron-log | ^5.0.0 | 日志 |
| ws | ^8.0.0 | WebSocket 客户端 |

---

## Reference Specs

| Spec | Path |
|------|------|
| Global Keyboard Hooks | `.trellis/spec/backend/global-keyboard-hooks.md` |
| Bluetooth HID Device | `.trellis/spec/backend/bluetooth-hid-device.md` |
| macOS Permissions | `.trellis/spec/backend/macos-permissions.md` |
| Text Input | `.trellis/spec/backend/text-input.md` |
| Native Module Packaging | `.trellis/spec/shared/native-module-packaging.md` |
| pnpm Electron Setup | `.trellis/spec/shared/pnpm-electron-setup.md` |
| IPC Patterns | `.trellis/spec/frontend/ipc-electron.md` |

---

## Acceptance Criteria

### MVP Done When:
1. ✅ 按住 Right Option 开始录音，松开自动插入文字
2. ✅ 悬浮窗实时显示录音状态和识别文字
3. ✅ 火山引擎 ASR 正常工作，中文识别准确
4. ✅ 文字正确插入到任意应用的光标位置
5. ✅ 应用可打包为 DMG 安装包

---

## Notes

- 优先实现 P0 功能，确保核心体验流畅
- 参考 `.trellis/spec/` 中的开发规范
- 所有原生模块需要正确配置打包
