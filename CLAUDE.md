# open-typeless

Last updated: 2026-04-19
Workspace: `/Users/chaosmac/Desktop/open-typeless`

## Development Guidelines

**在修改代码前，请遵循以下原则：**

### 通用
- 优先编辑现有文件，而非重写整个文件
- 除非文件被编辑过，否则不要重复阅读已读过的文件
- 输出追求简洁，但推理过程必须详尽

### 代码规范
- 单文件不超过 400 行，超出则拆分
- 嵌套不超过 4 层

1. **Think Before Coding**
   - 如果需求不明确，先问清楚，不要猜测
   - 如果有多种实现方式，先说明权衡，不要默默选择
   - 如果发现更简单的方案，主动提出

2. **Simplicity First**
   - 只写解决问题所需的最少代码
   - 不要添加未被要求的功能
   - 不要为单次使用的代码做抽象
   - 如果写了 200 行但可以用 50 行实现，重写它

3. **Surgical Changes**
   - 只修改与需求直接相关的代码
   - 不要"顺手"重构无关代码
   - 匹配现有代码风格，即使你有不同偏好
   - 只清理你自己的修改产生的孤立代码

4. **Goal-Driven Execution**
   - 将任务转化为可验证的目标
   - 多步骤任务先说明计划和验证点
   - 每步完成后验证，不要等到最后

## Project Status Snapshot

### 当前项目定位

- macOS 桌面语音入口工具。
- 主要能力是：全局热键唤起语音、实时 HUD、语音转文字、语音驱动 Agent、打开 ClawDesk。
- 当前代码已经不是“旧的多服务各自管热键”模式，语音主控以统一状态机为中心。

### 当前生效热键

- `Right Ctrl`（主热键）：
  - 空闲时短按一次，进入 Dictation 录音
  - 任一语音模式录音中，再按一次，统一停止当前录音并进入对应后处理
- `Right Ctrl + Shift`：
  - 空闲时启动 Command 模式录音
- `Right Ctrl + Space`：
  - 空闲时启动 Quick Ask 模式录音
- `Cmd+Shift+Space`：
  - 切换 `ClawDesk` 主窗口显示/隐藏
- Tray 左键：
  - 打开 tray menu

**备注**：代码中保留了 `Right Option` 系列作为兼容回退热键（针对某些键盘/IME 环境下 Right Ctrl 难以捕获的情况），但这不是当前主推热键方案。

### 当前 3 个语音模式

- `Dictation`
  - 录音结束后走听写整理，然后把文本插入当前光标位置
- `Command`
  - 录音结束后抓取当前页面上下文，打开居中 answer overlay，并把语音内容交给 OpenClaw 执行
- `Quick Ask`
  - 录音结束后不抓页面上下文，直接打开居中 answer overlay，按轻量问答执行

### ClawDesk 当前形态

- `ClawDesk` 现在是完整的桌面应用主窗口，不再是”热键附属壳”
- 应用启动后默认显示 ClawDesk 主窗口
- `Cmd+Shift+Space` 用于快速切换主窗口显示/隐藏
- 主窗口包含：
  - 左侧导航（Chat / Sessions / Settings / Workspace）
  - 中央工作区（Chat 页面为默认首页）
  - 顶部工具栏
- Chat 页面已接通真实 agent 执行链路（通过 `agentService`）
- Sessions 页面显示今日会话 + 历史日摘要
- Settings 页面包含四个分组：通用 / 服务商 / Skills / CLI
- Workspace 页面通过 webview 内嵌 OpenClaw gateway dashboard

### 当前是否以 VoiceModeManager 为统一主控

- 是。
- 当前语音模式的热键注册和状态切换，统一由 [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts) 接管。

## Current Architecture

### 当前真实状态机

- `idle`
- `dictation_recording`
- `command_recording`
- `quickask_recording`

状态切换规则：

- `idle -> dictation_recording`
  - `Right Ctrl` 短按触发
- `idle -> command_recording`
  - `Right Ctrl + Shift` 触发
- `idle -> quickask_recording`
  - `Right Ctrl + Space` 触发
- `*_recording -> idle`
  - 再按一次 `Right Ctrl`，统一停止当前录音

### 主要服务职责

- [src/main.ts](/Users/chaosmac/Desktop/open-typeless/src/main.ts)
  - 应用入口
  - 创建窗口
  - 注册 `Cmd+Shift+Space`
  - 初始化 `voiceModeManager`
- [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts)
  - 当前语音模式统一主控
  - 统一注册热键
  - 决定录音开始、停止、分流
- [src/main/services/keyboard/keyboard.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/keyboard/keyboard.service.ts)
  - 全局键盘 hook
  - 维护修饰键状态
  - 处理 chord 拦截，例如 `Right Ctrl` 先按、`Shift` 后补上的情况
- [src/main/services/asr/asr.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/asr/asr.service.ts)
  - 管理火山引擎流式 ASR 会话
  - 管理连接、结果、缓冲音频、停止等待最终结果
- [src/main/services/agent/dictation-refinement.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/agent/dictation-refinement.service.ts)
  - 听写整理分流
  - 决定走 `fast_clean_model` 还是 `smart_structured_model`
- [src/main/services/agent/lightweight-refinement-client.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/agent/lightweight-refinement-client.ts)
  - 调用火山方舟 OpenAI 兼容接口
  - 承载 Dictation 的轻量文本模型整理
- [src/main/services/text-input/text-input.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/text-input/text-input.service.ts)
  - 向当前焦点位置插入文本
- [src/main/services/agent/agent.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/agent/agent.service.ts)
  - 调用 `openclaw agent --agent main --json`
- [src/main/services/agent/context-capture.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/agent/context-capture.service.ts)
  - 抓取当前页面 / 应用上下文给 Agent 用

### Dictation / Command / Quick Ask / ClawDesk 的真实行为

- `Dictation`
  - `Right Ctrl` 启动
  - `Right Ctrl` 停止
  - 停止后执行：
    - `ASR stop`
    - `dictionaryService.apply + preclean`
    - `dictationRefinementService.refine`
    - 短文本（< 72 字符）：走 `fast_clean_model`，默认调用火山方舟轻量模型
    - 长文本（>= 96 字符）：走 `smart_structured_model`，默认调用火山方舟轻量模型
    - 轻量模型失败时 fallback 到本地规则
    - `textInputService.insert`
  - 这条链路不会打开 answer overlay 或 ClawDesk

- `Command`
  - `Right Ctrl + Shift` 启动
  - 统一由 `Right Ctrl` 停止
  - 停止后执行：
    - `ASR stop`
    - `contextCaptureService.capture`
    - 主进程直接 `agentService.execute`
    - 不再进入居中 answer overlay
    - 结果改由顶部 `topbarWindow` 承载：录音胶囊 → 执行红点 → 完成黑点 → 点击展开结果/历史

- `Quick Ask`
  - `Right Ctrl + Space` 启动
  - 统一由 `Right Ctrl` 停止
  - 停止后执行：
    - `ASR stop`
    - 构造轻量上下文 `{ appName: 'Voice Query', windowTitle: transcript.slice(0, 60) }`
    - `agentWindow.showWithContext`（居中 answer overlay）
    - 通过 `sendExternalSubmit` 把 transcript 送入 overlay
    - `agentService.execute` 在 renderer 侧执行

- `ClawDesk`
  - 应用启动后默认显示主窗口
  - `Cmd+Shift+Space` 或 tray 菜单可切换显示/隐藏
  - 主窗口包含完整桌面应用结构（sidebar + 工作区 + 多页面）
  - Chat 页面已接通 `agentService`，可独立收发消息
  - 与语音 3 模式不是同一个窗口，也不是同一套状态机

### 关键窗口关系

- `floatingWindow`
  - 底部中央 HUD
  - `focusable: false`
  - 显示内容：
    - 当前语音模式（Dictation / Command / Quick Ask）
    - 当前阶段（录音中 / 正在转写 / 准备执行 / 等待结果）
    - 状态圆点
  - 当前已固定为单尺寸极简胶囊，不再显示转写文本，也不再根据内容向上扩展

- `topbarWindow`
  - 顶部中央 Command 专用窗口
  - 使用同一个 `floating.html`，但通过 `?mode=topbar` 挂载独立 renderer
  - 视觉状态：
    - `recording`：黑色胶囊
    - `running`：红点
    - `done`：黑点
    - `expanded`：展开显示最近结果与历史
  - 只服务 `Command`，不影响 `Dictation / Quick Ask`

- `agentWindow`（answer overlay）
  - 居中轻量回答浮层（920×640）
  - 不可拖动，`Esc` 关闭
  - 只展示最新一轮问答，不显示完整历史
  - 移除了底部输入框，继续追问靠全局热键
  - `Command / Quick Ask` 会用到它
  - 当前显示方式：立即出现 → 显示"正在生成" → 文本逐段 reveal（伪流式）

- `clawDeskMainWindow`
  - 完整桌面应用主窗口
  - 包含 sidebar / 顶部工具栏 / 中央工作区
  - 默认首页为 Chat 页面
  - 由 `Cmd+Shift+Space` 切换显示/隐藏

- `recorderWindow`
  - 隐藏窗口
  - 用来承载 Web Audio API 录音
  - 不直接面向用户

### 当前 STT / polish / agent 执行链路

#### Dictation 链路

`KeyboardService -> VoiceModeManager -> ASRService.start -> recorderWindow/AudioRecorder -> ASRService.stop -> dictionary/preclean -> fast_clean_model | smart_structured_model -> local fallback(if needed) -> textInputService.insert`

#### Command 链路

`KeyboardService -> VoiceModeManager -> topbarWindow.showRecording -> ASRService.start -> ASRService.stop -> contextCaptureService.capture -> agentService.execute(OpenClaw, main process) -> topbarWindow.showRunning/showCompleted`

#### Quick Ask 链路

`KeyboardService -> VoiceModeManager -> ASRService.start -> ASRService.stop -> lightweight context -> agentWindow.showWithContext -> agentService.execute(OpenClaw)`

### 仍然存在但不再拥有热键注册权的旧服务

- [src/main/services/push-to-talk/push-to-talk.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/push-to-talk.service.ts)
- [src/main/services/push-to-talk/voice-command.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-command.service.ts)
- [src/main/services/push-to-talk/mode-c.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/mode-c.service.ts)
- [src/main/services/push-to-talk/agent-voice.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/agent-voice.service.ts)

说明：

- 这些文件还在仓库里，也仍然导出（保持 barrel 兼容性）。
- 但当前代码里，热键注册已经迁移到 `VoiceModeManager`。
- 2026-04-19 清理后：`AgentVoiceService` 已缩减为纯 no-op stub（移除了全部 short-press / long-press / intent routing 死代码）；其余三个文件已正确标注 `[LEGACY]`。
- `router/schemas.ts` 和 `router/classify-intent.ts` 不再被任何活跃代码引用（`agent.ts` 已移除其 re-export），可安全删除。
- 后续 agent 不要再根据这些旧 service 头部注释误判当前行为。

### ClawDesk Chat 语音输入（2026-04-19 新增）

- Chat 页面 composer 左侧新增麦克风按钮（`Mic` / `MicOff` 图标切换）
- 点击开始录音，再次点击停止录音并将转写结果填入输入框
- 复用现有 `recorderWindow + ASRService`，通过独立 IPC 通道 (`CLAW_DESK.VOICE_INPUT_TOGGLE / STOP`) 与 ClawDesk 主窗口通信
- **不与全局热键冲突**：如果全局语音模式正在录音，ClawDesk 语音按钮会被拒绝
- **不自动发送**：转写文本只填入输入框，用户手动点 Send 发送
- 链路：`Chat.tsx (renderer) → clawDeskApi.voiceInputToggle → claw-desk.handler → asrService.start/stop → 转写结果返回 renderer → setInput`
- **限制**：录音期间 floating HUD 可能同时显示（ASR status 广播），但用户在 ClawDesk 界面内能看到录音状态指示

## Known Issues

### 当前已知 bug / 风险

- **OpenClaw Agent 受 ChatGPT 速率限制（2026-04-19 确认）**
  - `You have hit your ChatGPT usage limit (plus plan). Try again in ~240 min.`
  - 影响范围：`Command` 模式执行、`QuickAsk` 问答执行（Dictation 不受影响，因为已改用火山方舟轻量模型）
  - 根本原因：配置的两个模型（`openai-codex/gpt-5.4`、`openai-codex/gpt-5.3-codex`）都走 OpenAI ChatGPT Plus，速率限制后全部失败
  - 之前的"凭证过期"诊断不准确 — 凭证有效，是 ChatGPT 速率限制
  - 内置捆绑插件（bluebubbles, discord 等）报 "host is 2026.4.2" 是插件版本检查噪音，不影响核心功能
  - 处理方式：等 ~240 分钟自动恢复，或在 `openclaw.json` 的 `agents.defaults.model.fallbacks` 中添加非 OpenAI 模型
  
- `Memory Service` 仍写入 `~/.feishu-agent/`，语义上是旧项目残留，后续可能需要迁移到 `open-typeless` 命名
- 一些旧 service 文件头注释仍在描述旧模式或旧热键（2026-04-19 已清理大部分，`router/` 目录可后续安全删除）
- Volcengine Ark 轻量模型需要通过自建 Endpoint 调用；公共模型名（如 `doubao-lite-32k-240828`）不被 Ark 服务支持，会返回 404
- answer overlay 的"流式显示"是伪流式（chunk reveal），不是真正的 token-level streaming，因为 OpenClaw CLI 当前只提供 final-only 输出
- `topbarWindow` 的结果历史当前只保存在内存里，不会跨应用重启持久化
- Tray 的旧 `commandResultStore / tray-state.service` 仍保留在仓库里，但当前 Command 新交互已不依赖它们

### 当前待验证项

- `Right Ctrl + Shift` 与 `Right Ctrl + Space` 的 chord 体验是否足够稳定，尤其是用户先按 `Right Ctrl` 再补按修饰键时
- `Command / Quick Ask` 录音中按 `Right Ctrl` 统一停止，这个交互是否符合用户预期，还是要改成”再次按原组合键停止”
- ChatGPT 速率限制重置后，`Command / QuickAsk` 的完整链路是否正常工作
- 是否需要配置非 OpenAI 的 fallback 模型以避免 ChatGPT 速率限制阻塞全部 agent 调用
- 是否需要支持用户在 Settings 中自定义热键（当前仍是硬编码）

### 当前容易误解的地方

- `Cmd+Shift+Space` 现在是 `ClawDesk` 主窗口切换热键，不是 Agent 面板热键
- `Right Option` 系列热键存在于代码中，但只是兼容回退方案，不是当前主推热键
- `Command / Quick Ask` 现在打开的是居中 answer overlay，不是右下角聊天面板
- `VoiceCommandService / ModeCService / AgentVoiceService` 仍存在，但热键注册权已迁移到 `VoiceModeManager`
- answer overlay 的"流式显示"是伪流式（chunk reveal），不是真正的 token-level streaming

## Recent Changes

### 2026-04-20: 稳定性 debug（退出失败 + Ctrl 偶发录不上音）

用户要求：

- 不要再改项目架构、交互逻辑或扩大功能范围
- 只做稳定性 debug，把现有 bug 调回来
- 重点关注：
  - `Command+Q` 无法真正退出
  - `Right Ctrl` 有时弹出 HUD 但没有真正录上音
  - 项目存在“有时成功、有时失败”的不稳定问题

本轮排查结论：

- **退出失败的根因已定位**
  - `agentWindow / floatingWindow / topbarWindow` 的 `close` 拦截依赖 `getIsAppQuitting()`
  - 但 `main.ts` 之前只调用了 `setQuitting(true)`，没有调用 `markAppQuitting()`
  - 结果是 `Command+Q` 触发退出时，部分窗口仍把关闭拦截成 `hide()`，导致应用不能稳定退出

- **录音“弹 HUD 但没录上”的根因已部分定位**
  - `main.log` 显示多次 Dictation 会话里：
    - ASR WebSocket 成功连接
    - 但服务端返回 `audio_info.duration: 0`
    - 最终文本长度一直是 0
  - 这说明问题不在火山 ASR 鉴权，而在本地录音音频块没有稳定送到主进程
  - 同时系统里有多份 `OpenTypeless` / `OpenTypeless Helper (Renderer)` crash report
  - 当前录音链路依赖隐藏的 `recorderWindow`；它一旦 crash 或失效，之前代码没有自恢复机制，主进程仍会继续启动 ASR，于是出现“图标弹了但没录上”

本轮实际改动：

- `src/main.ts`
  - `before-quit` 里补上 `markAppQuitting()`，并保留 `setQuitting(true)`
  - 这样所有依赖 app-lifecycle quitting 标记的窗口在真正退出时都不会再拦截 `close`
  - 给隐藏 `recorderWindow` 增加：
    - `did-finish-load` 后同步当前 ASR 状态
    - `render-process-gone` 自动重建
    - `did-fail-load` 自动重建
  - 录音 renderer 重建后，如果当前 ASR 仍在 `connecting / listening / processing`，可以重新收到状态而不是彻底失联
  - `Command+W` 改为通过 `clawDeskMainWindow.getWindow()` 访问，顺手消掉原本的 TS 私有字段报错

- `src/renderer.ts`
  - 给 `startRecording()` 增加 `isRecording / isStarting` 去重判断
  - 给 `stopRecording()` 增加 `isRecording / isStarting` 防抖判断
  - 目的不是改交互，而是避免 `connecting -> listening` 连续状态广播时重复触发录音启动/停止，减少隐藏 recorder 的竞态

重要决定与 tradeoff：

- **没有**改 `VoiceModeManager` 的模式逻辑、热键逻辑、后处理链路
- **没有**改 Dictation / Command / Quick Ask 的产品行为
- 这轮更像是“给现有实现补稳定性护栏”
- 录音失败问题目前做的是最小修复：优先保证隐藏 recorder 崩了以后能自动恢复，并减少重复 start 竞态
- 如果后续仍有极低概率复现，下一轮应继续围绕 recorder 生命周期和音频回调链做日志化，而不是动整体架构

本轮验证：

- `pnpm exec eslint src/main.ts src/renderer.ts` 通过
- `pnpm -s typecheck` 通过
- 日志验证到的问题证据：
  - 多次 ASR 会话成功连接但 `audio_info.duration: 0`
  - 隐藏 recorder 的 console log 在异常时段明显缺失
  - 存在 `~/Library/Logs/DiagnosticReports/OpenTypeless*.ips` 与 `OpenTypeless Helper (Renderer)*.ips`

已知风险 / 仍需观察：

- 这轮修完后，`Command+Q` 理论上应恢复正常，但我没有在桌面会话里直接做真实按键回归，只做了代码与生命周期链路修正
- 录音链路虽然已补自恢复，但如果底层 `getUserMedia / AudioContext / ScriptProcessorNode` 在特定 macOS 环境下继续间歇性失效，还需要继续盯 `main.log` 中：
  - `[recorder-renderer]`
  - `Received audio chunk from renderer`
  - `audio_info.duration`
- `ClawDesk window created` 在日志里仍出现多次，说明主窗口 renderer 也可能存在 crash / reload；这轮未扩展修它，避免越界改动

给下一位 agent 的具体 next steps：

- 先让用户实际回归：
  - `Command+Q` 是否能稳定退出
  - `Right Ctrl` Dictation 是否还会出现 HUD 弹出但完全无音频的情况
- 如果录音问题仍复现：
  - 优先继续查 `~/Library/Logs/OpenTypeless/main.log`
  - 对照 `recorder-renderer` 是否有 `getUserMedia succeeded`、`onaudioprocess fired`
  - 对照主进程是否持续出现 `Received audio chunk from renderer`
- 不要先去重构语音架构；继续维持“只修 bug”的策略

### 2026-04-20: 语音 HUD 小改版（只改外观，不改功能）

用户要求：

- 不要改动现有语音功能链路
- 只微调语音交互 HUD 的视觉
- 去掉录音时胶囊上的文字
- 让中间声纹在讲话时震动
- 把黑色胶囊整体缩小一点

本次实际改动：

- `src/renderer/src/modules/asr/components/FloatingWindow.tsx`
  - 移除 `StatusIndicator / TranscriptDisplay / ErrorDisplay` 这套“文字驱动”录音 HUD 结构
  - 改成固定宽度的小胶囊：左侧取消按钮、中间声纹、右侧确认按钮
  - 继续复用已有 `window.api.pushToTalk.cancel / confirm`，没有改任何录音、转写、执行逻辑
- `src/renderer/src/modules/asr/components/AudioWaveform.tsx`
  - 波形从 5 条改成更紧凑的 7 条
  - 录音时按 `audioLevel` 振动，非录音活跃态保留轻微 idle 动效，避免中间区域“死掉”
  - 增加 `tone` 区分：默认 / busy / error
- `src/renderer/src/styles/components/floating-window.css`
  - HUD 改成更接近 Typeless 参考图的黑色磨砂小胶囊
  - 删除转写文本区域和旧状态点样式
  - 新增左右圆形 action button 样式与中间白色声纹样式
- `src/main/windows/floating.ts`
  - 浮层窗口尺寸从 `224x64` 缩到 `196x52`

重要决定与 tradeoff：

- 这轮**只改底部 floating HUD**，没有动 `Command` 顶部 `topbarWindow` 的录音胶囊，避免把用户最近重做过的其他语音 UI 一起带动
- 保留了原本的取消 / 确认交互语义，只是把它们显式做成了按钮
- 按用户要求，录音时不再显示任何转写文字；代价是处理/错误阶段的信息密度更低，只能靠颜色和动态节奏区分

本轮验证：

- `pnpm exec eslint src/renderer/src/modules/asr/components/FloatingWindow.tsx src/renderer/src/modules/asr/components/AudioWaveform.tsx src/main/windows/floating.ts` 通过
- `pnpm -s typecheck` **未通过**，但报错是仓库已有问题，不是本轮引入：
  - `src/main.ts(229,28): Property 'window' is private and only accessible within class 'ClawDeskMainWindowManager'`
  - `src/main.ts(230,26): Property 'window' is private and only accessible within class 'ClawDeskMainWindowManager'`

已知风险 / 开放问题：

- 当前没有自动截图验证，最好由用户实际触发一次 Dictation 看尺寸和质感是否还要再缩一点
- `Command` 模式顶部录音胶囊仍是旧的文字版；如果用户希望三种语音入口完全统一，下一轮可以单独同步 topbar 录音态外观

给下一位 agent 的具体 next steps：

- 若用户觉得还“大”，优先继续调 `src/main/windows/floating.ts` 与 `floating-window.css` 里的 `196x52`、按钮 `34px`、中间波形宽度 `96px`
- 若用户要让 `Command` 录音态也统一成同款胶囊，查看 `src/renderer/src/modules/topbar/TopbarWindow.tsx` 与 `src/renderer/src/styles/components/topbar-window.css`
- 不要恢复 transcript 文本显示，除非用户明确要求

### 2026-04-19: 旧代码清理 + ClawDesk Chat 语音按钮

旧代码清理：

- `agent-voice.service.ts`：移除全部 short-press / long-press / intent routing 死代码，缩减为纯 no-op stub
- `push-to-talk.service.ts`：更新类级 JSDoc，正确标注 `[LEGACY]`，移除过时的"orchestrator"描述
- `keyboard.service.ts`：更新文件头注释，移除 "hold RightAlt for push-to-talk" / "AgentVoice" 等过期描述，改为当前三模式 chord 描述
- `asr.ts`：更新 `routing` 状态注释，从 "classifying intent" 改为 "dispatching to the active mode handler"
- `agent.ts`：移除 `IntentMode` / `RouteResult` re-export（不再有活跃消费方）
- `push-to-talk/index.ts`：更新模块级注释，明确 legacy 类的定位

已知遗留（本轮未删除，可安全后续清理）：

- `src/router/schemas.ts` 和 `src/router/classify-intent.ts` — 不再被任何活跃代码引用，可安全删除
- 三个 legacy stub 类的 barrel export 仍保留在 `push-to-talk/index.ts` 和 `services/index.ts`（兼容性考虑）

ClawDesk Chat 语音按钮：

- 新增 IPC 通道 `CLAW_DESK.VOICE_INPUT_TOGGLE` / `CLAW_DESK.VOICE_INPUT_STOP`（channels.ts）
- 新增 handler：`claw-desk.handler.ts` 中 `startClawDeskVoice / stopClawDeskVoice`
- 新增 preload API：`clawDeskApi.voiceInputToggle / voiceInputStop`（preload.ts）
- 新增类型声明：`ClawDeskApi.voiceInputToggle / voiceInputStop`（global.d.ts）
- Chat.tsx：composer 左侧新增 Mic 按钮，点击录音，再点停止并填入转写文本

本轮验证：

- `npm run typecheck` 通过（零错误）

待外部恢复后验证：

- ClawDesk Chat 语音按钮的实际录音+转写效果（依赖 ASR + 麦克风权限）
- 转写文本正确填入 composer 输入框

### 2026-04-19: 热键失效根本原因 — macOS 权限缺失（最终修复）

用户反馈问题：

- Right Ctrl / Right Ctrl+Shift / Right Ctrl+Space 三个热键完全无响应
- HUD（黑色小胶囊）无法弹出
- 问题表现不稳定，时好时坏

**真正根因**：

通过深入日志排查发现，VoiceModeManager 和键盘 hook 都正确初始化了，但有两个关键 macOS 权限缺失：

```
[warn] (permissions-service) Microphone permission not granted
[warn] (permissions-service) Reminding user to grant Input Monitoring in System Settings
[info] (permissions-service) Permission notification shown { missing: [ '麦克风', '输入监控' ] }
```

**问题分析**：

- **麦克风权限未授予** - 导致录音功能无法启动
- **输入监控权限未授予** - 导致全局热键监听失效
- 键盘 hook 虽然启动了，但系统阻止了按键事件传递
- 这解释了为什么问题"时好时坏" - 权限状态在不同启动间可能有差异

**解决方案**：

1. **授予麦克风权限**：
   - 系统偏好设置 → 安全性与隐私 → 隐私 → 麦克风
   - 找到 `OpenTypeless` 并勾选

2. **授予输入监控权限**：
   - 系统偏好设置 → 安全性与隐私 → 隐私 → 输入监控
   - 点击 "+" 按钮添加应用
   - 选择：`/Users/chaosmac/Desktop/open-typeless/out/OpenTypeless-darwin-arm64/OpenTypeless.app`
   - 勾选该应用

3. **完全重启应用**：
   - 权限更改后必须完全退出并重启应用才能生效

**验证结果**：

授权并重启后，三个热键应该恢复正常工作：
- `Right Ctrl` → Dictation 模式  
- `Right Ctrl + Shift` → Command 模式
- `Right Ctrl + Space` → Quick Ask 模式

**关键提醒**：

- macOS 的输入监控权限是全局热键功能的绝对前提条件
- 开发态下应用可能显示为 `Electron.app`，打包态显示为 `OpenTypeless.app`
- 之前的 cleanup 时机修复虽然有价值，但不是这次问题的根因

### 2026-04-19: Command 顶部灵动岛 + HUD 固定极简化

用户要求：

- Command 模式不要再落到底部中央 answer overlay
- 改成顶部灵动岛式交互：录音胶囊、执行红点、完成黑点、点击展开结果和历史
- 不改 Dictation / Quick Ask 热键与主链路
- HUD 不要再往上长，也不要再显示转写文本
- HUD 只保留模式、状态和圆点

已完成：

- 新增 [src/main/windows/topbar.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/topbar.ts)
  - 新建 `TopbarWindowManager`
  - 使用顶部居中定位
  - 管理 `recording / running / done / expanded` 四种视觉状态
  - 在主进程维护最近 Command 结果历史（当前内存态，最多 12 条）
- 新增 [src/main/ipc/topbar.handler.ts](/Users/chaosmac/Desktop/open-typeless/src/main/ipc/topbar.handler.ts)
  - 提供 `toggleExpanded / collapse`
- 新增 [src/shared/types/topbar.ts](/Users/chaosmac/Desktop/open-typeless/src/shared/types/topbar.ts)
  - 定义 topbar 共享状态与历史记录结构
- 更新 [src/shared/constants/channels.ts](/Users/chaosmac/Desktop/open-typeless/src/shared/constants/channels.ts), [src/preload.ts](/Users/chaosmac/Desktop/open-typeless/src/preload.ts), [src/types/global.d.ts](/Users/chaosmac/Desktop/open-typeless/src/types/global.d.ts)
  - 接入 `TOPBAR` IPC 通道与 renderer API
- 新增 [src/renderer/src/modules/topbar/TopbarWindow.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/modules/topbar/TopbarWindow.tsx) 和 [src/renderer/src/styles/components/topbar-window.css](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/styles/components/topbar-window.css)
  - 实现顶部胶囊、红点、黑点和展开结果面板
  - 展开态支持查看最近一条结果和历史列表
- 更新 [src/renderer/floating/index.ts](/Users/chaosmac/Desktop/open-typeless/src/renderer/floating/index.ts)
  - 新增 `?mode=topbar` 渲染入口
- 更新 [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts)
  - Command 模式不再调用 `agentWindow.showWithContext`
  - 改为主进程直接执行 `agentService.execute`
  - 录音时显示顶部胶囊，执行时切红点，结束后切黑点
  - Quick Ask 仍保留 answer overlay；Dictation 不变
- 更新 [src/main/windows/floating.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/floating.ts)
  - HUD 改为固定尺寸，不再动态改高度
  - 新增 `suppress/resume`，供 Command 模式在顶部交互时屏蔽底部 HUD
- 更新 [src/renderer/src/modules/asr/components/FloatingWindow.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/modules/asr/components/FloatingWindow.tsx), [src/renderer/src/modules/asr/components/StatusIndicator.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/modules/asr/components/StatusIndicator.tsx), [src/renderer/src/styles/components/floating-window.css](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/styles/components/floating-window.css)
  - HUD 只保留模式、状态、圆点
  - 去掉转写文本、波形和录音确认按钮
  - 位置固定，不再向上扩展

重要决定与取舍：

- Command 改为主进程直接监听 `agentService` 的 `chunk/done/error` 来收集最终文本，不再借用 `agentWindow` renderer 执行
- 为了避免动 Quick Ask 现有链路，`agentWindow` 只保留给 Quick Ask 使用
- 顶部 history 先做内存态，不在这轮引入本地持久化
- Tray 旧的 Command 红/绿点逻辑没有删除，但当前新交互不再依赖它

当前限制：

- `topbarWindow` 展开历史不会跨重启保留
- OpenClaw 仍是 final-only，Command 结果展示仍不是后端真 token streaming
- 顶部黑点目前不会自动消失，会一直保留到下一次 Command 或用户主动查看/切换

本轮验证：

- `npm run typecheck` 通过
- 新增 / 修改文件的定向 `eslint` 通过

### 2026-04-18: Command 模式静默化 + 状态栏红/绿点 + 底部确认浮层原型

用户要求：

- Command 模式（Right Ctrl+Shift）结束后不要再默认弹出右下角黑色 Agent 面板
- 改为静默后台执行，状态通过菜单栏图标表达：执行中显红点，完成未读显绿点
- 用户点击绿点图标后才打开 Agent 面板，查看这次 Command 的结果
- 不改 Right Ctrl+Shift 的录音触发逻辑，不动 Dictation / QuickAsk / ASR / 轻量模型
- 额外原型实现一个底部确认浮层（按钮式 MVP），为后续 Agent 询问确认预留能力

已完成：

- 新增 [src/main/services/tray/tray-state.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/tray/tray-state.service.ts)
  - 三态：`idle` / `processing` / `done-unread`
  - 红/绿点为内联 22×22 base64 PNG（非 template image，失去 macOS 深色自动反色）
  - 同时用 `tray.setTitle(' ●')` 作为第二通道
- 新增 [src/main/services/tray/command-result.store.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/tray/command-result.store.ts) 缓存最近一次 Command 结果
- 重写 [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts) `stopCommand()`：
  - 直接在主进程调用 `agentService.execute(transcript, context)`，不再走 AgentWindow renderer
  - 收集 `chunk` 文本 → `done`/`error` 时写入 `commandResultStore` 并把 tray 置为绿点
  - 预留 TODO 标注未来接入 `confirmOverlay.ask()`
- 扩展 [src/main/windows/agent.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/agent.ts)
  - 新增 `showWithBufferedResult(transcript, context, result, isError)` 只展示不执行
  - 文件头注释更新：Command 模式不再自动打开本窗口
- 新增 IPC 通道 `AGENT.SHOW_RESULT`、`CONFIRM_OVERLAY.*`
- 改 [src/main.ts](/Users/chaosmac/Desktop/open-typeless/src/main.ts)：
  - `trayStateService.attach(tray, icon)` 挂在 tray 创建之后
  - `tray.on('click')` 判断 `done-unread` → 打开 agent 窗口并复位，否则保留原菜单行为
- [src/renderer/src/modules/agent/AgentWindow.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/modules/agent/AgentWindow.tsx) 订阅 `onShowResult`，把 transcript 渲染成 user message，把 result 渲染成 assistant message，不重新触发 agent
- 新增 [src/main/windows/confirm-overlay.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/confirm-overlay.ts)：底部中央 480×140 frameless 浮层，slide-in/out 动画，`focusable:false` button-only MVP
- 新增 [src/renderer/src/modules/confirm/ConfirmOverlay.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/modules/confirm/ConfirmOverlay.tsx)：白底圆角卡片，右上 ×，最多 3 个按钮，`primary/secondary/danger` 三种变体，点击卡片内部会触发 `pin` 禁用 blur-to-hide
- `src/renderer/floating/index.ts` 新增 `?mode=confirm` 分支
- `src/preload.ts` / `src/types/global.d.ts` 增补 `confirmOverlay` API

关键取舍：

- Command 模式不再走 renderer sendExternalSubmit；主进程直连 `agentService`，链路更短，但失去 AgentWindow 本轮流式增量展示
- 红/绿点采用真实彩色 PNG 而不是 template icon，以换取语义清晰；为此放弃 macOS 深色菜单栏自动反色
- 底部确认浮层这轮不接 agent，纯原型，所有 API 已就位但没有实际调用方
- AgentWindow 未被删除；QuickAsk 仍直接打开它，Cmd+Shift+Space 打开 ClawDesk 的路径不变

当前已知问题：

- 红/绿点是非模板图，macOS 深色菜单栏下不会自动反色；视觉上可接受但与系统规范不完全一致
- `setTitle(' ●')` 作为文字通道，如果用户菜单栏极度拥挤可能被挤隐
- 若 Command 正在执行时用户再次触发 Command，`agentService.execute` 会 abort 旧任务；旧任务的 `chunk` 缓冲可能以部分文本落到绿点结果里（通常更早的 `done`/`error` 已经写入 store 再被下一轮覆盖）
- `confirmOverlay` 没有任何调用者；目前只是验证窗口 / IPC / 渲染通路是否能 work
- `confirmOverlay` 的 blur-to-hide 在 `focusable:false` 下几乎不会触发，实际 MVP 行为只靠 × 关闭

下一步建议：

- 把 Agent 的流式 token 也绑到 `trayStateService`，让红点可以带”仍在活跃”的动画
- Command 完成时发送系统通知，给用户明确的”可以点绿点查看”信号
- 为 `confirmOverlay` 定义 agent 询问协议，把它真正接入 `stopCommand()` 里那个 TODO 位

### 2026-04-18: Dictation 接入火山方舟轻量模型完成 + Ark Endpoint 配置

用户要求：

- 集成 Volcengine Ark 的轻量文本模型（Doubao-lite-32k）作为 Dictation 的默认后处理工具
- 已有 ARK_API_KEY 和消费配额；需要找到合适的 Endpoint ID 或公共模型名
- 验证端到端 Dictation 流程：录音 → ASR → 轻量模型 refinement → 文本插入

完成情况：

- **配置集成**
  - `.env` 新增：
    - `ARK_API_KEY=ark-933584d4-3a88-49c5-a9d3-b3b415fef2a3-4373b`
    - `DICTATION_REFINEMENT_ENDPOINT_ID=ep-20260418174840-72h7g`（从 Volcengine Ark 控制台获取，已激活 Doubao-lite-32k 240828 模型）
  - `.env.example` 已包含所有 Dictation refinement 配置项（`ARK_API_KEY`、`DICTATION_REFINEMENT_ENDPOINT_ID`、`DICTATION_REFINEMENT_MODEL`、`BASE_URL`、`TIMEOUT_MS`、`MAX_TOKENS`、`TEMPERATURE`）
  
- **模型 ID 选择**
  - 初期尝试使用公共模型名（`doubao-lite-32k-240828`）被 Ark 服务拒绝（404 error）
  - 原因：Volcengine Ark 的轻量模型需要通过已激活的自建 Endpoint 调用，不支持直接使用公共模型名
  - 解决：用户通过 Volcengine Ark 控制台手动找到已激活 Endpoint ID：`ep-20260418174840-72h7g`
  - 当前配置优先级：`DICTATION_REFINEMENT_ENDPOINT_ID` > `DICTATION_REFINEMENT_MODEL`，应用层自动选择优先级最高的有效配置

- **连接验证**
  - 使用 curl 测试 Ark OpenAI 兼容接口：`https://ark.cn-beijing.volces.com/api/v3/chat/completions`
  - 请求头：`Authorization: Bearer ${ARK_API_KEY}`，`Content-Type: application/json`
  - 模型参数：`model: ${ENDPOINT_ID}`，`temperature: 0.2`，`max_tokens: 220`
  - 结果：200 OK，模型成功响应

- **端到端测试结果**
  - 输入文本：146 字符的长段口述（中文，含重复、口头禅、”呃”等停顿词）
  - 触发模式：`smart_structured_model`（>= 96 字符）
  - 处理链路：ASR 识别 → dictionaryService 预清洗 → 决策为 `smart_structured` → 调用 Ark 轻量模型
  - 模型输出：70 字符，成功删除口头禅、重复、补标点
  - 往返延迟：~2.35s
  - 日志记录：`model_refinement_success` 明确标记模型调用成功

- **当前已知阻塞**
  - OpenClaw CLI 凭证过期：`codex-cli credential is unavailable`
  - 影响范围：`agentService.execute` 依赖 OpenClaw 后端，`Command / QuickAsk / smart_structured_model 的 AI refinement` 全部触发调用 OpenClaw agent
  - 根本原因：OpenClaw 2026.4.2 运行时插件版本过旧（需 >= 2026.4.10）+ codex OAuth 令牌过期
  - 用户已了解需运行 `codex-cli auth login` 刷新凭证，暂未执行（等待下一次启动或主动重新认证）

- **链路状态**
  - `Dictation fast_clean`（< 72 字符）：✓ 已就位，纯本地规则，不依赖 AI
  - `Dictation smart_structured`（>= 96 字符）：✓ 已就位，优先走 Ark 轻量模型，超时/报错回退本地规则
  - `Command`（Right Ctrl+Shift）：✗ 阻塞，需要 OpenClaw 凭证恢复
  - `QuickAsk`（Right Ctrl+Space）：✗ 阻塞，需要 OpenClaw 凭证恢复

涉及文件（不含旧工作）：

- `.env`：新增 `ARK_API_KEY` 和 `DICTATION_REFINEMENT_ENDPOINT_ID`
- `.env.example`：已包含所有配置示例

关键取舍与决策：

- Ark Endpoint ID 优先于公共模型名：避免 Volcengine 服务侧的配置变化影响应用（public model 名称可能变更，但 Endpoint ID 相对稳定）
- 轻量模型集成不改现有 `fast_clean` 本地规则链路：short/quick 场景仍速度优先
- `smart_structured` 的 AI 失败自动降级到本地规则：保证最坏情况下仍有可用输出，只是质量下降

### 2026-04-18: Dictation refinement 改成默认轻量模型链路

用户要求：

- 保留 Volcengine ASR
- 保留 `enable_punc / enable_itn / enable_nonstream / 热词 / 替换词`
- Dictation 正常路径不再纯本地输出
- 两档 refinement 都必须走轻量文本模型
- 彻底脱离 `openclaw agent --agent main` 的 Dictation 重链路

已完成：

- 新增 [src/main/services/agent/lightweight-refinement-client.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/agent/lightweight-refinement-client.ts)
  - 通过方舟 OpenAI 兼容 `chat/completions` 调轻量文本模型
  - 支持 `ARK_API_KEY`
  - 支持 `DICTATION_REFINEMENT_ENDPOINT_ID` 或 `DICTATION_REFINEMENT_MODEL`
  - 支持 `DICTATION_REFINEMENT_BASE_URL / TIMEOUT / MAX_TOKENS / TEMPERATURE`
- 重写 [src/main/services/agent/dictation-refinement.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/agent/dictation-refinement.service.ts)
  - 模式改成 `fast_clean_model / smart_structured_model`
  - 两档都默认调用轻量模型
  - 本地规则只保留为预清洗和失败 fallback
  - 日志明确区分 `model_refinement_success / model_refinement_fallback`
- 扩展 Volcengine ASR 环境配置与请求体
  - `VOLCENGINE_ENABLE_NONSTREAM`
  - `VOLCENGINE_BOOSTING_TABLE_ID / NAME`
  - `VOLCENGINE_CORRECT_TABLE_ID / NAME`
- 更新 [.env.example](/Users/chaosmac/Desktop/open-typeless/.env.example) 提供上述配置项示例

关键取舍：

- Dictation 的 AI 整理不再复用 OpenClaw 主 agent，避免重链路和不稳定延迟
- 正常路径统一走轻量模型；只有超时、报错、空结果才回退到本地规则
- 配置上优先支持 Ark Endpoint ID，不把公共模型名硬编码进主逻辑

### 2026-04-18: ClawDesk Home MVP + ClawX 壳层参考落地

用户要求：

- 为当前项目实现 `ClawDesk Home` MVP
- 不改现有语音模式机核心逻辑
- `Cmd+Shift+Space` 继续作为 `ClawDesk` 呼出热键
- `ClawDesk Home` 必须永远能打开，即使 OpenClaw gateway / dashboard 异常
- 允许参考 ClawX，但不能整仓 fork，也不能把 ClawX 克隆进当前项目目录
- 随后又补充要求：需要真正参考 ClawX 的代码结构和 UI 壳层实现，并允许单独克隆到 `/Users/chaosmac/Desktop/_repo_review/ClawX`

已完成：

- 保留 `Cmd+Shift+Space -> ClawDesk` 现有入口，不改 `Right Ctrl / Right Ctrl+Shift / Right Ctrl+Space` 语音模式机
- 把 ClawX 单独克隆到 `/Users/chaosmac/Desktop/_repo_review/ClawX` 做代码级分析
- 分析了 ClawX 的：
  - Electron `main / preload / renderer` 分层
  - `MainLayout + Sidebar + TitleBar` 主窗口骨架
  - Chat / 控制台页的布局感与控制台层级
- 在当前项目内新增独立 `ClawDesk Home` renderer，而不是继续把 OpenClaw dashboard 直接当首页
- 为 `ClawDesk` 新增最小专用 IPC / preload API：
  - 读取当前 gateway 状态
  - 刷新连接状态
  - 进入 Full Workspace
  - 返回 Home
- 重写 `src/main/windows/claw-desk.ts`：
  - 默认显示本地 Home
  - Full Workspace 改为二级动作
  - 如果 workspace 打不开，自动回退到 Home，不白屏
- 新增 `clawdesk.html` + `vite.clawdesk.config.ts` + `src/renderer/clawdesk/*`
- 让 `ClawDesk Home` 具备：
  - 顶部状态区
  - 控制台主操作区
  - 快捷入口
  - Recent Session 占位/真实会话摘要
  - Settings placeholder
  - gateway offline 时的明确反馈
- 在第二轮增强中，把 ClawX 的壳层参考真正落实到当前 Home：
  - 从单块卡片页，升级成更接近桌面工作台的 `sidebar + content` 壳层
  - 增加类似 ClawX 的桌面控制台层级，而不引入它完整业务边界

关键取舍：

- 这次是 `参考实现`，不是 `局部迁移整页代码`
- 借的是 ClawX 的壳层组织和桌面控制台感，不是它的 Models / Channels / Skills / Cron 产品范围
- `ClawDesk Home` 仍然是轻量入口页，不扩成完整控制台
- Full Workspace 仍使用当前 OpenClaw dashboard，只是退到二级入口
- 默认继续后台预热 `clawDeskWindow.create()`，但不自动弹出

当前实现边界：

- `Cmd+Shift+Space` 现在默认打开 `ClawDesk Home`
- 用户点击 `Open Full Workspace` 后，同一窗口进入完整 OpenClaw workspace / dashboard
- 如果 gateway 不可达或 config 缺失：
  - `ClawDesk Home` 仍能正常打开
  - 页面会显示离线状态和下一步动作
  - 进入 Full Workspace 失败时会自动留在 / 回到 Home

验证结果：

- `npm run typecheck` 通过
- 针对这次新增/修改的 `ClawDesk` 相关文件执行的定向 eslint 通过
- 仓库全量 `npm run lint` 仍受旧文件中的既有 lint 问题影响，不是这轮新增逻辑导致

已知限制 / 开放问题：

- 当前 `ClawDesk Home` 的 sidebar 只是壳层导航感，不是真导航系统
- Settings / Recent Session 仍是轻量入口，其中 Settings 仍是 placeholder
- 当前只做“进入 Full Workspace”，还没有在 workspace 内增加“返回 Home”的显式按钮；用户当前可以通过再次呼出 `Cmd+Shift+Space` 回到 Home
- 目前 gateway 健康判断是基于本地配置 + 端口可达性，不是更深的 OpenClaw 内部子系统健康检查

下一步最小建议：

- 如果继续增强，优先加一个 workspace 内可见的 `Back to Home`
- 然后再把 Recent Session 做成真实可点击入口
- 最后再考虑把 Settings placeholder 接到现有设置能力，而不是继续扩首页

### 2026-04-18: ClawDesk Home 第二轮壳层收口

用户要求：

- 不重开思路，继续在当前 `ClawDesk Home` 基础上优化
- 保留 `Cmd+Shift+Space` 呼出逻辑
- 重点修复窗口交互，尤其是拖动体验
- 不再把首页做成纯状态页
- 让 `Home` 更像真实桌面工作台入口
- 让 `Full Workspace` 成为二级视图，而不是窗口直接跳到原始网页封装页

已完成：

- 把 `Full Workspace` 从“main process 直接 `loadURL` 跳转整窗”改成：
  - `ClawDesk Home` 内部的二级视图
  - 通过 `webview` 内嵌完整 OpenClaw workspace
  - 保留当前桌面壳不消失
- 新增 `claw-desk:get-workspace-target`，让 renderer 先拿到 workspace URL，再决定进入二级视图
- 为 `ClawDesk Home` 增加真正的顶部 drag region：
  - 顶部标题区使用 `-webkit-app-region: drag`
  - 按钮区域使用 `no-drag`
  - 修复“看起来像直接打开一个网页”的窗口体验
- 重做 `ClawDesk Home` 主结构：
  - 保留更克制的左侧导航
  - 增加桌面壳顶部条
  - 首页主区聚焦“工作台入口”
  - 状态信息退居辅助层，不再是首页主角
- `Workspace` 视图内增加：
  - `Back to Home`
  - `Reload Workspace`

关键取舍：

- 仍然没有扩功能页数量
- 仍然没有引入 ClawX 的完整业务边界
- 借的是桌面壳秩序，不是整套产品导航树
- 当前 `Workspace` 仍然是 OpenClaw 原始界面，但已经被放进当前壳里，用户不会感知成“整窗退化成网页”

验证结果：

- `npm run typecheck` 通过
- 针对本轮 `ClawDesk` 相关文件的定向 eslint 通过

当前状态：

- `Cmd+Shift+Space` 打开后先看到 `Home`
- 点击 `Open Full Workspace` 后，在同一桌面壳里进入二级 `Workspace`
- 点击 `Back to Home` 可回首页
- 窗口拖动区域已在 Home / Workspace 两种视图中统一提供

### 2026-04-18: ClawDesk 升级为 Desktop App 主窗口骨架

用户要求：

- 不再把当前 UI 当成“热键呼出的桌面壳”继续修补
- 产品目标升级为真正可直接使用的 `OpenClaw Desktop App`
- 应用启动后应直接显示主窗口
- 主窗口应具有完整桌面应用层级：
  - 左侧导航
  - 中央主工作区
  - 顶部工具栏
  - Settings / Sessions / Workspace 等页面结构
- 可以参考 ClawX 的结构和秩序感，但不能整仓照搬
- 不要动现有语音模式机核心逻辑

关键判断：

- 当前项目原来的问题不只是“首页不够好看”，而是主产品形态仍停留在：
  - 终端 / 语音链路为主体
  - `ClawDesk` 只是附属壳
  - `Home` 和状态卡片主导体验
- 因此这轮不是继续补 `Home`，而是把 `ClawDesk` 重新收口成主窗口应用入口

本轮已完成：

- `app.on('ready')` 后直接显示 `clawDeskWindow`
- 不再默认隐藏 macOS Dock，使应用表现更接近正常桌面 App
- 保留 `Cmd+Shift+Space` 作为 show / hide 快捷键，但它不再是唯一入口
- 重构 `ClawDesk` renderer 为完整 Desktop App 骨架，而不是单页壳：
  - 左侧导航
  - 顶部工具栏
  - 主工作区
  - 页面切换
- 当前已具备这些一级页面结构：
  - `Chat Workspace`
  - `Home / New Chat`
  - `Sessions`
  - `Settings`
  - `OpenClaw Workspace`
  - `Models / Skills / Channels / Tasks` 结构预留位
- `OpenClaw Workspace` 仍作为完整页面存在，但已经被纳入主应用导航层级，而不是主窗口默认体验
- `Chat Workspace` 已搭出真正主工作区骨架：
  - 线程显示区
  - 右侧辅助栏
  - composer 区
  - 可承接后续真实 OpenClaw chat runtime 接入

这轮参考了 ClawX 的地方：

- 主窗口组织方式：`sidebar + top bar + content`
- 页面层级和应用秩序感
- 工作台中心区优先、状态信息退居辅助层
- Settings / Models / Skills / Channels / Tasks 的产品分区思路

明确没有照搬的部分：

- 没有迁移 ClawX 的完整 router / store / provider / cron / setup 体系
- 没有把它完整 chat runtime 直接搬进当前项目
- 没有把当前项目改造成 ClawX 的 fork

验证结果：

- `npm run typecheck` 通过
- 针对本轮新增 / 修改文件的定向 eslint 通过

当前状态：

- 应用启动后即可直接显示主窗口
- 主窗口现在是 `ClawDesk` Desktop App 骨架，而不是热键附属壳
- `Cmd+Shift+Space` 继续作为 show / hide 切换
- 语音链路、ASR、mode manager 未被改动

下一步最小建议：

- 先把 `Chat Workspace` 真实接到当前 Agent / OpenClaw 会话链路
- 然后把 `Sessions` 做成真实多会话切换
- 再把 `Settings` 接到现有配置能力

### 2026-04-18: ClawDesk 命名与主应用结构收口

用户要求：

- 直接基于 ClawX 的桌面 UI 结构高相似度参考
- 不再把当前产品描述成轻量壳首页
- 统一命名为：
  - 产品名：`ClawDesk`
  - 主窗口：`ClawDeskMainWindow`
  - 主应用页面：`ClawDeskApp`
- 减少后续决策和返工，优先形成完整、可演示、可操作的桌面端主应用界面

本轮已完成：

- 把 renderer 主页面从过渡态命名 `ClawDeskHome` 改为 `ClawDeskApp`
- 把主窗口管理从 `clawDeskWindow / ClawDeskManager` 改为 `clawDeskMainWindow / ClawDeskMainWindowManager`
- 保留 `Home` 作为主应用中的一个页面，而不再把它当产品总形态
- 继续强化主应用骨架，当前主窗口中已有：
  - 左侧导航
  - 顶部工具区
  - 主工作区
  - `Chat Workspace`
  - `Home / New Chat`
  - `Sessions`
  - `Settings`
  - `OpenClaw Workspace`
  - `Models / Skills / Channels / Tasks` 结构预留位

这轮参考 ClawX 的重点：

- 主窗口的产品结构和页面层级
- Sidebar 驱动的一级导航
- 顶部工具区 + 中央工作区 + 辅助侧栏的工作台组织方式
- 把 Chat 作为主应用中心，而不是把状态页作为中心

当前结果：

- 应用启动后直接显示 `ClawDesk` 主窗口
- `Cmd+Shift+Space` 继续保留为 show/hide
- `ClawDeskApp` 已经是完整主应用骨架，而不是壳首页
- 当前仍保留 OpenClaw workspace 嵌入页，但它已降级为主应用中的一个页面，而不是默认主体验

### 2026-04-18: ClawX 远程可复用性评估

用户要求：

- 远程分析 `https://github.com/ValueCell-ai/ClawX`
- 判断它是否适合作为当前项目未来 `ClawDesk` 的桌面 UI / 桌面壳参考或复用来源
- 明确这次只做可复用性分析，不修改当前项目，也不要把 ClawX 克隆进当前项目目录

已完成：

- 读取当前项目 `CLAUDE.md`，以当前真实边界为准评估 ClawX
- 远程核对 ClawX GitHub README、目录结构、`package.json`、`electron/main`、`electron/gateway`、`scripts/bundle-openclaw.mjs`
- 确认 ClawX 是 Electron + React 桌面应用，内嵌 OpenClaw runtime，不是单纯 Web UI 或 CLI 包装
- 确认它更接近“完整 AI workspace / console”，不是轻量快捷呼出式桌面壳
- 判断本轮远程信息已足够，不需要本地克隆到 `/Users/chaosmac/Desktop/_repo_review/ClawX`

关键判断：

- ClawX 最值得借的是：
  - 桌面应用外壳组织方式（Electron main / preload / renderer / gateway manager 分层）
  - 设置页、模型页、渠道页、Cron 页、Agent 面板式 workspace UI
  - OpenClaw gateway 生命周期管理与主进程代理思路
- ClawX 不适合直接当作当前项目的 `Cmd+Shift+Space` 弹出式 `ClawDesk`
  - 默认主窗口是完整工作台尺寸，不是轻量 overlay
  - 产品范围很重，包含 setup、channels、skills、cron、settings、tray、updater、provider 管理
  - 直接 fork 再裁剪，后续维护成本和与上游分叉成本都会偏高
- 如果只借 20%，优先借“桌面壳的 UI 信息架构 + 主进程到 OpenClaw gateway 的通信分层”，不要先借整套产品流程

重要取舍：

- 本轮不修改任何当前项目代码
- 本轮不在当前项目内克隆 ClawX
- 本轮也不开始集成，只保留为后续 `ClawDesk` 方案选型依据

已知限制 / 开放问题：

- 当前判断基于远程源码与仓库结构，足以做选型判断，但还没有验证其真实运行手感
- 如果未来要做高保真参考，下一步应单独克隆到 `/Users/chaosmac/Desktop/_repo_review/ClawX`，重点看 `src/pages/Chat`、`src/components/layout`、`electron/main/window.ts`、`electron/gateway/*`
- 还未和其他候选 OpenClaw 桌面壳做横向比较，因此当前结论是“可作为参考源之一”，不是“最佳唯一方案”

### 2026-04-18: 热键无法触发的兼容修复

用户问题：

- `Right Ctrl` 无法启动 Dictation
- 基于同一套键盘钩子的其他语音热键也无法触发

已完成：

- 保留当前 `Right Ctrl` 主方案
- 为语音模式增加一套兼容回退热键：
  - `Right Option` 也可启动 Dictation
  - `Right Option + Shift` 也可启动 Command
  - `Right Option + Space` 也可启动 Quick Ask
- 在 `KeyboardService` 中补全了 `Right Option` 的 modifier 跟踪，允许它同时作为触发键和组合键修饰符
- 修正权限提示：
  - 明确把 `Input Monitoring` 视为全局热键必要条件
  - 启动提醒和 tray 提示不再把“麦克风 + 辅助功能已授权”误写成“权限都已授予”
  - 明确提示：授权输入监控后需要重启应用

关键判断：

- 当前代码里的热键注册本身已经成功执行，日志中可见 `VoiceModeManager initialized`
- 但 macOS 的 `Input Monitoring` 无法被 Electron 正式查询，导致“钩子成功启动但收不到任何按键事件”这类情况之前很难被发现
- 某些键盘 / 系统输入环境下，`Right Ctrl` 也可能比 `Right Option` 更容易失效，因此加了回退映射

涉及文件：

- [src/main/services/keyboard/keyboard.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/keyboard/keyboard.service.ts)
- [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts)
- [src/main/services/permissions/permissions.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/permissions/permissions.service.ts)
- [src/main.ts](/Users/chaosmac/Desktop/open-typeless/src/main.ts)

### 2026-04-18: Dictation 后处理补强 + 语音消息进入对话框

用户问题：

- ASR 能识别，但不确定后面是否真的做了轻量再处理
- 想确认是否真的在做 clean / structured 整理
- 语音处理后没有出现在 Agent 对话框里

定位结论：

- 当前确实存在 Dictation 后处理层：`dictationRefinementService.refine`
- 但之前只要 OpenClaw 超时或失败，就会直接退回“字典纠正后的原文”，不会再做本地 clean / structured
- `Command / Quick Ask` 语音链路之前是直接在 main process 后台调用 `agentService.execute`
- 因此 Agent 面板里不会先出现一条“用户语音消息”，看起来像“后台跑了，但对话框里没有”

已完成：

- 给 Dictation refinement 增加本地 fallback：
  - `clean`：去口头禅、压缩重复、规范标点
  - `structured`：在 `clean` 基础上按列点 / 段落信号做轻量换行整理
- OpenClaw 超时 / 启动失败 / 返回失败时，不再直接回退到原文，而是回退到本地轻量整理结果
- 给 Agent 面板新增 `external-submit` 通道
- `Command / Quick Ask` 现在会：
  - 先把语音转写内容作为一条用户消息放进对话流
  - 再由 renderer 正常发起 agent 请求
  - 这样用户在对话框里能看到自己的语音内容和后续 assistant 回复

涉及文件：

- [src/main/services/agent/dictation-refinement.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/agent/dictation-refinement.service.ts)
- [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts)
- [src/main/windows/agent.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/agent.ts)
- [src/preload.ts](/Users/chaosmac/Desktop/open-typeless/src/preload.ts)
- [src/renderer/src/modules/agent/AgentWindow.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/modules/agent/AgentWindow.tsx)
- [src/shared/constants/channels.ts](/Users/chaosmac/Desktop/open-typeless/src/shared/constants/channels.ts)
- [src/types/global.d.ts](/Users/chaosmac/Desktop/open-typeless/src/types/global.d.ts)

### 2026-04-18: HUD 状态展示与真实处理阶段对齐

用户问题：

- 按键结束录音后，HUD 很快闪过 `Processing`
- 紧接着又闪过 `Done`
- 但真正的文本插入要更晚才发生
- 第一次使用时，会误以为流程已经结束或者出错

根因：

- 底层 ASR transport 在收到最终识别结果后，会立刻发出 `done -> idle`
- HUD 之前直接跟着 ASR transport 走
- 但 Dictation 的真实后续阶段还包括：
  - refinement
  - text insert
- 所以出现“HUD 已结束，但业务还没结束”的错位

已完成：

- 调整 `ASRService`：
  - 不再把底层 transport 的 `done / idle` 直接当成最终用户态
  - 这些终态改由上层语音模式在真正完成后再发送
- 调整 Dictation 停止后的状态顺序：
  - `processing`：等待最终识别结果
  - `routing`：整理 / 准备后处理
  - `executing`：执行最后一步（例如插入）
  - `done`：真正完成后才出现
- 调整 HUD 文案：
  - `processing` -> `Transcribing`
  - `routing` -> `Preparing`
  - `executing` -> `Finishing`

涉及文件：

- [src/main/services/asr/asr.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/asr/asr.service.ts)
- [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts)
- [src/renderer/src/modules/asr/components/StatusIndicator.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/modules/asr/components/StatusIndicator.tsx)

### 2026-04-18: 权限提示与 Volcengine / 文本后处理链路核对

用户问题：

- 系统权限提示里找不到明确对应的项目项，不清楚该如何处理
- 想确认当前是否真的在用 Volcengine 流式 ASR
- 想确认 `Preparing` 阶段是否存在极小的文本处理框架，以及其中是否用了 AI

核对结论：

- 当前代码确实走 Volcengine 流式 ASR：
  - 配置读取在 [src/main/services/asr/lib/config.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/asr/lib/config.ts)
  - WebSocket 客户端在 [src/main/services/asr/lib/volcengine-client.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/asr/lib/volcengine-client.ts)
  - `STTProvider` 当前实现是 `VolcengineSTTProvider`
  - 项目根目录 `.env` 中存在 `VOLCENGINE_APP_ID` / `VOLCENGINE_ACCESS_TOKEN` / `VOLCENGINE_RESOURCE_ID`
- 当前 `Preparing` 背后确实有一层极小文本处理框架：
  - 先走 `dictionaryService.apply`
  - 再自动选择 `clean` 或 `structured`
  - 优先用 OpenClaw 调 AI 做 refinement
  - 如果 AI 超时或失败，则回退到本地轻量规则整理

关于 AI：

- 当前 Dictation refinement 会用到 AI，但不是强依赖
- 当前实现是直接调用：
  - `openclaw agent --agent main --json --message <prompt>`
- Prompt 目标非常单一：
  - 保留原意
  - 删除口头禅 / 重复
  - 补标点 / 断句
  - 必要时做轻量结构化
  - 只输出最终文本，不解释

权限说明：

- macOS 的 `Input Monitoring` 不能被 Electron 程序正式查询
- 所以即使应用能弹通知，也不一定能在系统列表里立刻以你预期的名字出现
- 开发态下权限有时会挂在 `Electron`、终端启动器，或系统尚未记录的运行实体上
- 当前项目已经在 UI 提示层明确把这一点写出来了；如果系统里实在找不到明确条目，只能先按当前建议忽略这一点继续测试，除非再次出现“热键完全无响应”

涉及文件：

- [src/main/services/asr/lib/config.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/asr/lib/config.ts)
- [src/main/services/asr/lib/volcengine-client.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/asr/lib/volcengine-client.ts)
- [src/audio/stt/provider.ts](/Users/chaosmac/Desktop/open-typeless/src/audio/stt/provider.ts)
- [src/audio/stt/volcengine-provider.ts](/Users/chaosmac/Desktop/open-typeless/src/audio/stt/volcengine-provider.ts)
- [src/main/services/agent/dictation-refinement.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/agent/dictation-refinement.service.ts)

### 2026-04-18: refinement 分流改成 fast clean / smart structured

用户要求：

- 明确区分 `fast clean` 和 `smart structured`
- 短句不要每次都调 AI
- 只有长段、列事项、明显边想边说时再进 AI
- structured 不要乱改原意

已完成：

- `dictation-refinement.service.ts` 现在拆成两档：
  - `fast_clean`
  - `smart_structured`
- 当前策略：
  - `fast_clean`
    - 只走本地规则
    - 用于短句、普通口述、没有明显结构化需求的输入
  - `smart_structured`
    - 先判断是否值得进 AI
    - 只有长段、列项、重复多、明显重说/断裂时才调 OpenClaw
    - AI 失败或超时则退回本地 `localStructured`
- 新增分流日志：
  - `Dictation refinement decision`
  - 会记录当前 mode、原因、文本长度，便于判断 AI 是否真的被调用

当前阈值：

- `FAST_CLEAN_MAX_LENGTH = 72`
- `SMART_STRUCTURED_MIN_LENGTH = 96`
- `SMART_STRUCTURED_TIMEOUT_MS = 4500`

当前结论：

- AI refinement 不再“每次都尝试调用”
- 现在只有 `smart_structured` 才会真正调用 AI
- `fast_clean` 稳定、快、成本低
- `smart_structured` 保持“保留原意、只做轻量结构化”的 prompt 约束

涉及文件：

- [src/main/services/agent/dictation-refinement.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/agent/dictation-refinement.service.ts)

### 2026-04-18: 文档真相收口

用户要求：

- 不改业务代码，先消除 `AGENTS.md` 和 `CLAUDE.md` 里的冲突与过时信息
- 让 `CLAUDE.md` 成为唯一“当前架构真相”来源
- 让 `AGENTS.md` 退回规则文件

已完成：

- 重写 `AGENTS.md`，只保留 Trellis 入口、workflow 规则、memory 更新规则
- 重构 `CLAUDE.md` 顶部结构，按“当前真相 / 当前架构 / 已知问题 / 最近修改 / 下一步”组织
- 以代码为准重新确认热键、模式、窗口关系、状态机、旧服务角色
- 初始化 Trellis developer identity：`codex-agent`

关键取舍：

- 这一步不动业务逻辑，只修正文档真相来源
- 旧内容保留在最近修改与历史备注里，不再放在文件顶部污染当前判断

### 近几轮重要修改

- Agent 后端已切到 `OpenClaw`
  - 主调用方式是 `openclaw agent --agent main --json`
- 菜单栏图标改成 template icon 方案
- tray 左键改成弹菜单，避免白板/白窗触发路径
- 录音交互已改成 toggle 风格
- ASR 链路补过连接缓冲与 stop/start 竞态修复
- 浮窗已接入真实音量波形
- 录音中已隐藏实时转写文本
- 听写结果已增加 AI 整理步骤

## Historical Notes / Archived Notes

以下内容属于旧阶段说明，不能再当作当前实现：

- `Right Option` 作为 Dictation 主热键
- `Left Ctrl + Space` 作为 Temp Chat 主热键
- `Right Ctrl` 短按打开 Agent 面板、长按进入 Page Action
- `Cmd+Shift+Space` 抓上下文后打开 Agent 面板
- 旧的“Phase 1 = Right Option 听写闭环”表述
- 旧的“多个 service 分别持有自己热键”表述

这些内容如果还要参考，只能作为历史演进背景，不能指导当前改代码。

## Next Steps

### 未来方向

- **用户自定义热键**：当前热键仍是硬编码，后续计划支持用户在 Settings 中自定义热键
- **Settings 扩展**：
  - 服务商配置页面当前只显示摘要，后续可增加配置编辑能力
  - Skills 页面已支持本机技能扫描，后续需实现 OpenClaw skills 双向同步与删除联动
  - CLI 页面已支持推荐与检测，后续可增加安装指引与工具详情面板
- **真正的 token streaming**：当前 answer overlay 是伪流式，如需真流式需确认 OpenClaw 是否有 gateway / websocket / internal event API 可直接接入
- **Session 架构升级**：当前是 per-day JSON，不支持多会话并发，后续可考虑引入 session-id 机制
- **旧代码清理**：清理旧 service 文件头注释和命名歧义，避免代码内注释继续传播旧热键信息

### 2026-04-19: Answer Overlay UX 修复 — HUD 卡住、ESC 残留、空录音处理

用户问题：

1. **空录音卡住**：快速按两次 Ctrl（没说话）后，HUD 显示 "transcribing" 并卡住不消失
2. **ESC 后 HUD 残留**：按 ESC 关闭 answer overlay 后，HUD 仍然显示
3. **流式文本动画**：用户不需要看到文字逐字出现的视觉效果
4. **HUD 底部文字框残留**：录音时 HUD 底部显示转写文本，用户不需要
5. **完成后延迟关闭**：Dictation 完成后 HUD 停留 2 秒才关闭，用户希望立即关闭
6. **无光标时的 fallback**：当无法插入文本时（无光标/无焦点），需要提供复制按钮

根本原因：

- **空录音卡住**：`stopDictation/Command/QuickAsk()` 检测到空结果时调用 `floatingWindow.hide()`，但如果 `shouldDeferHide = true`（Command/QuickAsk 模式），`hide()` 被阻止，没有强制隐藏机制
- **ESC 后 HUD 残留**：Agent 窗口的 ESC 处理只隐藏自己，没有通知 FloatingWindow，`shouldDeferHide` 标志未重置
- **流式文本动画**：AgentWindow 有逐字显示动画（`resolveRevealStep` 和 `syncVisibleAnswer`），每 18ms 显示一段文本
- **HUD 底部文字框**：FloatingWindow 组件渲染了 `floating-window__meta` 和 `TranscriptDisplay`
- **完成后延迟关闭**：Dictation 成功后调用 `sendStatus('done')`，触发 2 秒自动隐藏
- **无 fallback**：插入失败时只显示错误，没有提供复制选项

已完成：

1. **添加强制隐藏机制**：
   - `src/main/windows/floating.ts` 新增 `forceHide()` 方法，重置 `shouldDeferHide` 标志后强制隐藏
   
2. **修复空录音处理**：
   - `src/main/services/push-to-talk/voice-mode-manager.ts` 中所有空结果检查改为调用 `forceHide()` 而非 `hide()`
   
3. **修复 ESC 后 HUD 残留**：
   - `src/main/ipc/agent.handler.ts` 的 `AGENT.HIDE` 处理中添加 `floatingWindow.forceHide()`
   
4. **添加最小录音时长检查**：
   - `src/main/services/asr/asr.service.ts` 新增 `recordingStartTime` 字段追踪录音开始时间
   - `stop()` 方法中检查录音时长，少于 200ms 直接返回 null 并清理状态
   
5. **移除流式文本动画**：
   - `src/renderer/src/modules/agent/AgentWindow.tsx` 移除 `resolveRevealStep` 函数和逐字显示逻辑
   - `syncVisibleAnswer` 改为直接返回完整内容
   - 移除相关的 timer 和 state 管理代码

6. **移除 HUD 底部文字框**：
   - `src/renderer/src/modules/asr/components/FloatingWindow.tsx` 移除 `floating-window__meta` 和 `TranscriptDisplay` 组件
   - HUD 现在只显示状态指示器和错误信息

7. **Dictation 完成后立即关闭**：
   - `src/main/services/push-to-talk/voice-mode-manager.ts` 中 Dictation 成功后改为调用 `forceHide()` 而非 `sendStatus('done')`

8. **插入失败时的复制 fallback**：
   - 插入失败时自动复制文本到剪贴板
   - 显示系统对话框提示已复制，并显示文本预览和失败原因

涉及文件：

- [src/main/windows/floating.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/floating.ts) — 添加 `forceHide()` 方法
- [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts) — 空结果/成功完成时调用 `forceHide()`，插入失败时显示复制对话框
- [src/main/ipc/agent.handler.ts](/Users/chaosmac/Desktop/open-typeless/src/main/ipc/agent.handler.ts) — ESC 隐藏时调用 `forceHide()`
- [src/main/services/asr/asr.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/asr/asr.service.ts) — 添加最小录音时长检查
- [src/renderer/src/modules/agent/AgentWindow.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/modules/agent/AgentWindow.tsx) — 移除流式文本动画
- [src/renderer/src/modules/asr/components/FloatingWindow.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/modules/asr/components/FloatingWindow.tsx) — 移除底部文字框

验证结果：

- `npm run typecheck` 通过

当前限制 / 已知问题：

- **HUD 往上移**：当前设计是保持底边固定向上扩展，暂未修改（可选改进）
- **Command 模式显示方式**：用户期望的"灵动岛"效果需要新建 TopBar 窗口和完整 UI 改造，暂未实现
- **OpenClaw 回答链路仍然不是后端真流式**：`openclaw agent --json` 仍然是 final-only，answer overlay 的首字时间还是受 CLI 限制

测试方法：

1. **测试空录音不再卡住**：快速按两次 Right Ctrl（不说话），预期 HUD 立即消失
2. **测试 ESC 后 HUD 消失**：按 Right Ctrl + Shift 开始 Command，说一句话，等待 answer overlay 出现，按 ESC，预期 HUD 也立即消失
3. **测试最小录音时长**：按 Right Ctrl 立即释放（录音时长 < 200ms），预期 HUD 显示后立即消失
4. **测试流式文本动画移除**：按 Right Ctrl + Space 开始 Quick Ask，说一句话，预期回答文本直接显示，没有逐字动画
5. **测试 HUD 无底部文字**：录音时 HUD 只显示状态指示器，不显示转写文本
6. **测试立即关闭**：Dictation 完成后 HUD 立即消失，不停留
7. **测试复制 fallback**：在无光标位置（如桌面）按 Right Ctrl 说话，预期弹出对话框提示已复制到剪贴板

### 2026-04-18: ClawDesk Phase 2 — Chat / Sessions / Workspace 真实接线

用户要求：

- 不要再把 `ClawDesk` 做成轻量状态首页
- 直接高相似度参考 ClawX 的桌面 UI 框架和交互骨架
- 把当前主窗口做成更像可演示桌面 App 的主工作区
- 保留现有窗口层和热键逻辑，不动语音模式机核心

本轮完成：

- 重写 [src/renderer/clawdesk/ClawDeskApp.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/ClawDeskApp.tsx)
  - 默认主视图改成真正的聊天工作区入口
  - 侧边栏改成更接近 ClawX 的结构：
    - 品牌区
    - `New Chat`
    - `Sessions`
    - `Settings`
    - `Models / Skills / Channels / Tasks` 结构位
    - 底部 `OpenClaw Workspace`
  - 中央主区改成更接近 ClawX 的空态欢迎页和持久聊天区
  - `Sessions / Settings / Workspace` 保留为同一主应用里的真实页面
- 重写 [src/renderer/clawdesk/styles.css](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/styles.css)
  - 统一成深色桌面工作台外观
  - 更强的 sidebar / titlebar / panel / composer 层级
  - 空态主区改成大标题 + quick actions + 底部 composer，明显参考 ClawX 的桌面聊天入口
  - Settings 改成更接近参考图的行项设置页
  - Workspace 保持嵌入在壳里，不再是默认主体验

关键取舍：

- 这轮主要目标是把桌面 UI 骨架做对，而不是继续扩业务
- 仍未把主聊天 composer 直接接进 OpenClaw 主聊天 runtime
- 当前 composer 点击发送时：
  - gateway 在线：引导进入完整 workspace
  - gateway 离线：给出明确状态反馈
- 这样至少保持了 UI 主应用真实可用，同时没有误改现有语音链路

验证结果：

- `npm run typecheck` 通过
- 定向 `eslint` 对 TS 文件通过
- 纯 CSS 文件不能直接用 `eslint` 解析，这不是实现错误

当前限制 / 已知问题：

- 主聊天区现在还是“桌面应用骨架 + 可交互入口”，不是完整原生聊天 runtime
- `Models / Skills / Channels / Tasks` 仍是结构位
- 如果下一轮继续提升可演示性，优先项应是：
  - 把 composer 接入当前项目自己的真实会话执行链
  - 补 `Sessions` 多会话切换
  - 再细修 sidebar / topbar / spacing 到更高相似度

### 2026-04-18: ClawDesk Phase 2 — Chat / Sessions / Workspace 真实接线

用户要求：
- 把 ClawDesk 从 Phase 1 的壳层推进到真正可用的桌面 App
- 不碰 voice mode / floating window / agent window 核心逻辑
- Theme 不优先

已完成：

- **Chat 真实接线**：`src/renderer/clawdesk/pages/Chat.tsx` 从占位改为真实 composer，经 `window.api.agent.sendInstruction` 调用主进程 `agentService`（即 `openclaw agent --agent main --json`），流式 chunk 经新接的 clawdesk 广播通道回显。
- **主进程广播扩展**：`src/main/windows/claw-desk.ts` 新增 `sendChunk / sendDone / sendError / sendDailySummaryReady`，`src/main/ipc/agent.handler.ts` 在 agentService 事件处同时 fanout 到 agent window 和 clawdesk window。两个 renderer 都能独立消费同一条流。
- **Chat store**：`src/renderer/clawdesk/stores/chat.ts` 用 zustand 管理 messages / status / streamingId，hydrate 时从 `memoryService.loadTodaySession()` 恢复今日对话，debounce 400ms 落盘 `~/.feishu-agent/sessions/YYYY-MM-DD.json`。
- **Sessions 真实接线**：`src/renderer/clawdesk/pages/Sessions.tsx` 拉 `getDailySummaries` 显示历史，顶部显示 today 会话（turns 数来自当前 store），新建会话调 `chatStore.newSession()` 清空今日 messages 并写空 session。
- **Workspace webview 内嵌**：`src/renderer/clawdesk/pages/Workspace.tsx` 走 `clawDesk.getWorkspaceTarget()` 拿带 token 的 `http://127.0.0.1:<port>/#token=...`，用 `<webview>` 内嵌，offline 时显示原因 + Retry。

关键取舍：
- ClawDesk 的 Chat 和 agent window 共用同一个 `agentService` 单例，两个 UI 会看到同一条流。这是特性不是 bug — 用户从 voice 模式触发 Command / Quick Ask 时，agent window 和 ClawDesk Chat 都能同步看到输出。
- 多会话没实现。当前的 session 模型是 memoryService 的 per-day JSON，不是多个并发 session。ClawDesk Sessions 页面诚实展示这一点。
- Workspace 用 `<webview>` 而不是主进程 loadURL 切换窗口，确保 sidebar 壳不消失。

涉及文件：
- 主进程：`src/main/windows/claw-desk.ts`、`src/main/ipc/agent.handler.ts`
- renderer：`src/renderer/clawdesk/pages/{Chat,Sessions,Workspace}.tsx`
- renderer：`src/renderer/clawdesk/stores/chat.ts`（新增）

验证：`npm run typecheck` 通过。voice mode / floating / agent window 代码未动。

当前 ClawDesk 状态：
- Chat 页面已经能收发，用户在 ClawDesk 里打字 = 调 agent service = openclaw 处理 = 流式结果回显。
- Sessions 页面显示 today 的实时 turn 数 + history 的每日 consolidation summary。
- Workspace 页面 webview 嵌入 OpenClaw gateway dashboard（若 gateway 在线）。

演示前的最小修复（10 分钟）：
1. 把 sidebar.tsx 的 disabled SOON 项（Models/Agents/Channels/Skills/Cron）隐藏或移到单独的"More"分组。否则点进去全是占位页。
2. 在 sidebar 补一条 Sessions 导航，或者把 chat history 列表挪进 sidebar（参考 ClawX）。

---

## Development Notes

### 自动更新 CLAUDE.md

**规则**：每次完成一个明确的工作单元（feature、fix、refactor），在该工作的"Recently Changed"或最末尾追加一条简要笔记。格式：
```markdown
### YYYY-MM-DD: 简短描述

- 做了什么
- 涉及哪些文件
- 已知限制

验证：npm run typecheck / npm run start 结果
```

**不需要详细重写整个章节**，只需在历史笔记末尾追加，保持时间倒序。这样 CLAUDE.md 成为工作日志，而不是长期不变的架构说明。

### 项目关键约束

- **不碰语音核心链路** (src/main/services/push-to-talk/, src/main/services/keyboard/, src/main/services/asr/, voice-mode-manager)
  - Dictation / Command / Quick Ask 的热键、录音、停止、分流都已稳定
  - Command / Quick Ask 可触发 agent window，agent window 和 ClawDesk 现在共享同一个 agentService 实例，两个 UI 同步看流

- **ClawDesk 是独立 renderer entry**
  - 配置单独的 vite config (vite.clawdesk.config.ts)
  - tailwind content glob 只扫 clawdesk.html + src/renderer/clawdesk/**
  - 不污染 floating / agent renderer 的样式

- **Session 模型局限**
  - 当前 per-day JSON on disk (~/.feishu-agent/sessions/YYYY-MM-DD.json)
  - 不是多会话并发架构（没有 session-id，没有切换保存机制）
  - ClawDesk 的"New Chat"只是清空今日 messages，重新从空开始

### 2026-04-18: ClawDesk Phase 2 收尾 — Sidebar 真导航 + Workspace 加载兜底

- **Sidebar 收口为真实主导航**：更新 `src/renderer/clawdesk/components/layout/Sidebar.tsx`
  - 主导航现在只暴露已可用页面：`Chat Workspace`、`Sessions`、`OpenClaw Workspace`、`Settings`
  - 移除了演示时会露怯的 `Models / Agents / Channels / Skills / Cron` 侧栏入口
  - `New Chat` 现在会真的清空今日会话并回到 Chat
  - 侧栏中部补了真实内容：Today 会话摘要 + 最近 `DailySummary` 历史摘要
- **Workspace 页增强加载体验**：更新 `src/renderer/clawdesk/pages/Workspace.tsx`
  - `webview` 增加 `did-start-loading / did-stop-loading / did-fail-load` 监听
  - 增加壳内 loading 提示
  - 增加 `Reload View`
  - 失败时切回明确错误态，而不是卡在空白 webview
- **静态检查收口**：
  - 将本轮 touched 的 clawdesk 页面与布局文件里的 `@/` alias 改成相对路径，避免 eslint `import/no-unresolved`

验证：

- `npm run typecheck` 通过
- 对本轮相关 ClawDesk 文件执行的定向 `eslint` 通过

当前影响：

- ClawDesk 更像真实桌面 App，而不是“壳很像，但用户一打开就会点到半成品”
- Workspace 的首次加载、刷新、失败反馈更可靠

仍未完成：

- 多 session id 架构仍不存在；Sessions 还是“今日会话 + 历史日摘要”
- Chat composer 仍然没有直接接语音按钮，语音入口还是全局热键
- TitleBar 的 Windows 自定义控制仍是 stub，没有接主进程窗口控制 IPC

### 2026-04-18: ClawDesk Settings 第一轮落地 — 通用 / 服务商 / Skills / CLI 真数据接通

用户要求：

- 不再让 `Settings` 页面保持空壳
- 先落 4 个分组：通用 / 服务商 / Skills / CLI
- `Skills` 需要先同步本机已有技能，包含 Claude Code skills，并把 OpenClaw skills 同步需求记进架构
- `CLI` 页面先做”推荐 + 延迟检测”
- `通用` 先补：版本信息、GitHub 发布 / 自动更新状态、浅色 / 深色 / 跟随系统
- `服务商` 先做”语音服务商 / 小文本处理服务商”的摘要样貌，不做复杂配置

本轮完成：

- **通用分组**：
  - 版本信息（从 `app.getVersion()` + `package.json` + `process.versions` 读取）
  - 主题切换（light / dark / system，持久化到 `userData/clawdesk-settings.json`）
  - 发布脚本状态与自动更新占位
- **服务商分组**：
  - 语音服务商摘要（基于 `.env` 判断 Volcengine 是否已配置）
  - 小文本处理服务商摘要（基于 `.env` 判断 Ark refinement 是否已配置）
  - 仅显示摘要，不提供密钥编辑
- **Skills 分组**：
  - 扫描本机技能目录：`~/.codex/skills`、`~/.agents/skills`、`~/.openclaw/skills`
  - 读取 `SKILL.md`，提取技能名称、描述、路径、来源、命令名
  - 左侧技能列表 + 右侧详情区 + 搜索框
  - 真实显示本机扫描结果
- **CLI 分组**：
  - 参考 CodePilot 的 CLI catalog
  - 主进程异步检测本机安装状态与版本
  - 推荐工具列表 + 已安装工具列表 + 手动重检

重要取舍：

- **OpenClaw skills 双向同步/删除**这轮没有直接实现，只做了安全的读取与展示
- **服务商页这轮不做密钥编辑**，当前只显示配置状态和摘要
- **自动更新不假装已完成**，当前只诚实显示是否存在 `publish` script 和自动更新是否已配置

当前已知边界：

- `~/.openclaw/skills` 目录存在，但当前扫描时未发现真实 `SKILL.md` 文件；因此 OpenClaw skills 计数可能为 0
- `CLI` 目录是精简版，不是完整搬运 `CodePilot`
- `Settings` 还没有真正的”写服务商配置””安装/删除技能””安装 CLI 工具”能力

涉及文件：

- 新增 [src/shared/types/clawdesk-settings.ts](/Users/chaosmac/Desktop/open-typeless/src/shared/types/clawdesk-settings.ts)
- 新增 [src/main/services/clawdesk/settings.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/clawdesk/settings.service.ts)
- 扩展 [src/main/ipc/claw-desk.handler.ts](/Users/chaosmac/Desktop/open-typeless/src/main/ipc/claw-desk.handler.ts)
- 扩展 [src/renderer/clawdesk/stores/ui.ts](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/stores/ui.ts)
- 重写 [src/renderer/clawdesk/pages/Settings.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/pages/Settings.tsx)
- 修改 [src/renderer/clawdesk/ClawDeskApp.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/ClawDeskApp.tsx)

### 2026-04-18: Quick Ask / Command 回答弹层改成居中轻量 answer overlay

用户要求：

- 不改语音识别链路本身，只改 `Quick Ask / Command` 的”回答如何显示”
- 不要再弹出像聊天软件的黑色右侧对话框
- 改成更轻、更克制、居中出现的即时回答浮层
- 去掉底部输入框，继续追问靠现有热键：`Right Ctrl` / `Right Ctrl+Shift` / `Right Ctrl+Space`
- `Esc` 直接关闭

已完成：

- **Command / Quick Ask 统一回到回答浮层显示**
  - 修改 [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts)
  - `stopCommand()` 和 `stopQuickAsk()` 都通过 `agentWindow.showWithContext` + `sendExternalSubmit` 打开居中 answer overlay
- **回答窗口改成居中 answer overlay**
  - 修改 [src/main/windows/agent.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/agent.ts)
  - 窗口尺寸改为 `920x640`
  - 不再右下角停靠，改成根据当前鼠标所在屏幕 workArea 居中显示
  - `movable` 改为 `false`，不再作为可拖动聊天窗
- **renderer 从”聊天面板”改成”临时回答层”**
  - 重写 [src/renderer/src/modules/agent/AgentWindow.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/modules/agent/AgentWindow.tsx)
  - 当前 UI 只展示：顶部轻量 header、一行上下文信息、当前问题、当前回答、底部热键提示
  - 移除了：底部输入框、mic/send/abort 按钮、对话 / 历史 tab、IM 风格左右气泡聊天布局
- **Esc 现在可直接关闭**
  - 在 overlay renderer 内监听 `Escape`
  - 触发 `window.api.agent.hide()`
- **把”全量完成后一次性闪现”收口成可见增量输出**
  - 修改 [src/main/services/agent/agent.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/agent/agent.service.ts)
  - 现在即便 OpenClaw CLI 只给最终结果，主进程也会把最终文本切成更自然的小 chunk，再通过现有 `agent:stream-chunk` 通道逐段发给 renderer
  - overlay renderer 侧又加了一层 reveal 动画，因此用户会看到：浮层先立即出现 → `正在生成… / 正在输出…` → 文本逐段展开

关键判断与取舍：

- **当前不是真正的后端 token streaming**
  - 本机 OpenClaw 版本是 `2026.4.15`
  - 通过 `openclaw agent --help` 和本地安装代码确认，`openclaw agent` 当前公开 CLI 只提供最终结果输出；`--json` 是最终 envelope，非事件流
  - 所以这轮能做的是：让 overlay 立即出现、明显显示”正在回答”、收到最终结果后以 chunk/reveal 方式增量显示
  - 做不到的是：真正首 token 级别、模型边生成边到 UI 的实时流
- **优先不重构主应用**
  - 没新建 answer overlay window
  - 继续复用现有 `agentWindow` 这条 window / preload / IPC 链路，只把它的展示语义从 chat panel 改成 answer overlay

当前限制 / 已知问题：

- `OpenClaw` 这条链路仍不是”真流式”；首字时间仍然受 CLI final-only 限制
- 当前 overlay 只展示”最新一轮”问答，不再显示完整历史；历史消息仍然会落 session，但 UI 不把它当聊天列表展开

涉及文件：

- [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts)
- [src/main/windows/agent.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/agent.ts)
- [src/renderer/src/modules/agent/AgentWindow.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/modules/agent/AgentWindow.tsx)
- [src/renderer/src/styles/components/agent-window.css](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/styles/components/agent-window.css)
- [src/main/services/agent/agent.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/agent/agent.service.ts)

### 2026-04-18: 基础交互回归修复 — 热键链路正常，主要问题在 HUD 可见性与提交反馈

用户要求：

- 暂停新的 UI 优化，优先修复最基础的交互回归 bug
- 确认并恢复：`Right Ctrl` / `Right Ctrl + Shift` / `Right Ctrl + Space`
- 用户必须清楚看到：是否开始录音、当前是哪种模式、是否已经提交、是否正在等待结果

排查结论：

- **热键监听没有整体失效**
  - 通过日志确认 `keyboard-service` 仍成功注册：`CtrlRight` / `CtrlRight + shift` / `Space + rctrl`
  - 日志可见 `VoiceModeManager: START dictation / command / quickask`
- **状态机也没有整体失效**
  - 日志可见：`ASR session started successfully` / `Received audio chunk from renderer`
  - 说明热键 → `VoiceModeManager` → `ASR` 录音链路仍在工作
- **真正回归点是”可见性链路”**
  - HUD 只显示一个通用丸子，不显示当前模式
  - `Command / Quick Ask` 在 `VoiceModeManager.stopCommand()` / `stopQuickAsk()` 里一进入 `executing` 就立刻 `floatingWindow.hide()`
  - 如果 answer overlay 还没来得及形成明显反馈，用户体感就是”按了没反应”

已完成修复：

- **恢复 HUD 的模式可见性**
  - 新增 [src/shared/types/push-to-talk.ts](/Users/chaosmac/Desktop/open-typeless/src/shared/types/push-to-talk.ts)
  - 扩展 `IPC_CHANNELS.PUSH_TO_TALK.STATE`
  - 在 [src/main/windows/floating.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/floating.ts) 增加 `sendVoiceState()`
  - 在 [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts) 每个模式开始 / processing / routing / executing / done / error 时推送 voice overlay state
- **恢复转写可见反馈**
  - 修改 [src/renderer/src/modules/asr/components/FloatingWindow.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/modules/asr/components/FloatingWindow.tsx)
  - HUD 现在重新渲染 `TranscriptDisplay`
  - 录音 / 转写过程中用户能看到当前转写文本
- **让 HUD 明确显示当前模式 + 当前阶段**
  - 修改 [src/renderer/src/modules/asr/components/StatusIndicator.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/modules/asr/components/StatusIndicator.tsx)
  - 录音态中间区域现在显示：模式（Dictation / Command / Quick Ask）+ 阶段（录音中 / 已提交，正在转写 / 转写完成，准备执行 / 已提交，等待结果）
- **修复 Command / Quick Ask 提交后”瞬间消失”的问题**
  - 修改 [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts)
  - `stopCommand()` / `stopQuickAsk()` 不再在进入 `executing` 后立即 hide HUD
  - 现在会先显示”已提交，等待结果”，然后延迟约 `700ms` 再隐藏，给 answer overlay 接管留出过渡时间
- **扩大 HUD 尺寸以容纳可靠反馈**
  - 修改 [src/main/windows/floating.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/floating.ts)
  - 宽度 / 高度上限同步调整到能容纳模式、阶段、转写文本的尺寸

本轮结论：

- 根因**不是**三个热键都没被捕获
- 根因**也不是** `VoiceModeManager` 完全坏了
- 根因主要是：
  1. HUD 在最近改动里被收得过度，模式和转写不可见
  2. `Command / Quick Ask` 提交后 HUD 过早隐藏，answer overlay 接管前存在”无声空档”
  3. 于是用户误以为 `Right Ctrl / Right Ctrl+Shift / Right Ctrl+Space` 都失效了

涉及文件：

- [src/shared/types/push-to-talk.ts](/Users/chaosmac/Desktop/open-typeless/src/shared/types/push-to-talk.ts)
- [src/main/windows/floating.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/floating.ts)
- [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts)
- [src/renderer/src/modules/asr/components/FloatingWindow.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/modules/asr/components/FloatingWindow.tsx)
- [src/renderer/src/modules/asr/components/StatusIndicator.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/modules/asr/components/StatusIndicator.tsx)
- [src/renderer/src/styles/components/floating-window.css](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/styles/components/floating-window.css)

### 2026-04-18: 热键失效和 HUD 不显示的稳定性修复

用户反馈问题：

1. 快捷键冲突 - Right Ctrl / Right Ctrl+Shift / Right Ctrl+Space 无法执行
2. HUD（黑色小胶囊）弹不出来
3. Bug 不稳定，时好时坏

根因分析：

- 日志显示 `Keyboard hook stopped (no more triggers)`
- `voiceModeManager.dispose()` 被意外调用，注销了所有热键
- 原因是 `app.on('before-quit')` 在 macOS 上会在关闭窗口时触发，但应用并未真正退出
- macOS 的 `window-all-closed` 不会退出应用（tray 保持应用存活），但 `before-quit` 已经执行了 cleanup
- 导致应用还在运行，但键盘 hook 已经被停止

已完成：

- **修复 cleanup 时机**
  - 修改 [src/main.ts](/Users/chaosmac/Desktop/open-typeless/src/main.ts)
  - 从 `app.on('before-quit')` 改为 `app.on('will-quit')`
  - `will-quit` 只在应用真正退出时触发，不会在关闭窗口时误触发
- **增加 activate 时重新初始化**
  - 在 `app.on('activate')` 中检查 voiceModeManager 是否已初始化
  - 如果已 dispose 但应用还在运行，重新初始化
- **增加日志**
  - `initialize()` 和 `dispose()` 增加明确日志
  - 方便后续排查类似问题

关键取舍：

- `will-quit` 是应用真正退出前的最后事件，此时 cleanup 是安全的
- `before-quit` 在 macOS 上可能在窗口关闭时触发，但应用未退出
- 增加 activate 重新初始化作为兜底，即使出现异常 dispose 也能恢复

验证：

- `npm run typecheck` 通过

给下一个 agent 的具体下一步：

1. 如果用户继续反馈热键失效，检查日志中是否有 `VoiceModeManager disposed` 出现
2. 如果 HUD 仍然不显示，需要检查 `floatingWindow.show()` 是否被正常调用
3. 当前修复针对的是"应用未退出但 cleanup 被误触发"的场景

### 2026-04-18: Answer overlay UX 修复 — 尺寸优化 + 底部升起 + 防抖 + ESC 修复

用户反馈问题：

1. 窗口尺寸过大，不够优雅
2. 窗口位置应该从底部中央升起，不要居中
3. ESC 关闭后卡死
4. 快速双击触发空识别
5. 流式输出后卡住

已完成：

- **窗口尺寸和位置优化**
  - 修改 [src/main/windows/agent.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/agent.ts)
  - 尺寸从 920×640 改为 680×420
  - 位置从屏幕居中改为底部中央（距底部 60px）
  - 出现动画从 `scale + translateY` 改为纯 `translateY(40px)`，更符合"从底部升起"的语义
- **视觉风格改成深色毛玻璃**
  - 修改 [src/renderer/src/styles/components/agent-window.css](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/styles/components/agent-window.css)
  - 背景从浅色渐变改为 `rgba(28, 28, 30, 0.88)` 深色半透明
  - 边框从浅色改为 `rgba(255, 255, 255, 0.18)`
  - 毛玻璃模糊从 20px 提升到 40px
  - 所有文本颜色改为浅色系（`rgba(245, 245, 247, ...)`）
  - 内部卡片背景改为 `rgba(58, 58, 60, 0.5)`
  - 字号整体缩小（20px → 15px，17px → 15px，12px → 11px）
  - padding 整体收紧
- **ESC 关闭卡死修复**
  - 修改 [src/main/windows/floating.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/floating.ts)
  - `allowHide()` 改为直接调用 `hide()`，不再判断 `autoHideTimer`
  - 确保 answer overlay 通知后 HUD 能立即隐藏
- **快速双击防抖**
  - 修改 [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts)
  - 新增 `lastStartTime` 字段
  - `startDictation()` / `startCommand()` / `startQuickAsk()` 都加了 500ms 防抖
  - 快速双击时第二次会被 debounce 拦截，不会触发空识别

关键取舍：

- 窗口改小后更轻量，但仍保留足够空间显示完整回答
- 深色毛玻璃风格更现代，与 macOS 系统风格更一致
- 从底部升起的动画更符合"临时浮层"的语义
- 500ms 防抖足够拦截误触，但不会影响正常连续操作

当前仍不是真流式的卡点：

- OpenClaw CLI 仍然是 final-only 输出
- 这轮优化的是 UI 尺寸、位置、视觉风格和交互稳定性

验证：

- `npm run typecheck` 通过

给下一个 agent 的具体下一步：

1. 如果用户继续反馈"流式输出后卡住"，需要具体日志定位是哪个环节卡住（ASR / agent service / renderer）
2. 如果要继续优化视觉，可以考虑给内部卡片加更细腻的阴影和圆角过渡
3. 当前防抖是固定 500ms，如果用户觉得太长或太短可以调整

### 2026-04-18: Answer overlay 最小修复 — 临时回答层收口 + HUD 交接优化

用户要求：

- 暂停新的 UI 优化，优先修复当前 answer overlay 的交互体验
- 三个最小修复：
  1. 让 agentWindow 只负责"当前这一轮"，不再恢复历史
  2. 让 HUD 和回答浮层的交接更连贯，不要过早消失
  3. 给 answer overlay 一个明确的出现动画

已完成：

- **agentWindow 改成纯临时回答层**
  - 移除 [src/renderer/src/modules/agent/AgentWindow.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/modules/agent/AgentWindow.tsx) 中的 `getTodaySession` 恢复逻辑
  - 移除 `saveSession` 持久化逻辑
  - `onShow` 时清空 messages，不再累积历史
  - `onExternalSubmit` 和 `onShowResult` 时直接替换 messages 为当前这一轮
  - 现在每次打开只显示最新一轮问答，不再是完整会话历史
- **HUD 延迟隐藏直到 answer overlay 真正接管**
  - 新增 [src/main/windows/floating.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/floating.ts) `deferHide()` / `allowHide()` 机制
  - 修改 [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts)
  - `stopCommand()` / `stopQuickAsk()` 在打开 answer overlay 前调用 `floatingWindow.deferHide()`
  - 移除之前的 700ms 固定延迟隐藏
  - answer overlay 收到第一个可见 chunk 时通过新增的 `AGENT.FIRST_CHUNK_VISIBLE` IPC 通知主进程
  - 主进程收到通知后调用 `floatingWindow.allowHide()` 才真正隐藏 HUD
  - 现在 HUD 会一直显示"正在等待回答"，直到回答浮层真正开始输出内容
- **answer overlay 出现动画**
  - 修改 [src/renderer/src/styles/components/agent-window.css](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/styles/components/agent-window.css)
  - 新增 `agent-window-appear` 动画：从 `scale(0.94) translateY(12px) opacity(0)` 到完整显示
  - 280ms cubic-bezier(0.16, 1, 0.3, 1) 缓动
  - 克制但明显，让用户感知到"HUD → 回答浮层"的过渡
- **新增 IPC 通道**
  - [src/shared/constants/channels.ts](/Users/chaosmac/Desktop/open-typeless/src/shared/constants/channels.ts) 新增 `AGENT.FIRST_CHUNK_VISIBLE`
  - [src/preload.ts](/Users/chaosmac/Desktop/open-typeless/src/preload.ts) 新增 `agent.notifyFirstChunkVisible()`
  - [src/types/global.d.ts](/Users/chaosmac/Desktop/open-typeless/src/types/global.d.ts) 新增类型定义
  - [src/main/ipc/agent.handler.ts](/Users/chaosmac/Desktop/open-typeless/src/main/ipc/agent.handler.ts) 注册监听器

关键取舍：

- agentWindow 现在是真正的"临时回答层"，不再承担会话历史职责
- ClawDesk Chat 继续负责完整历史和持久化（未动）
- HUD 隐藏时机从"固定延迟"改成"等待 answer overlay 真正接管"
- 这轮没有改 OpenClaw CLI 的流式输出限制，仍然是主进程 pseudo-chunk replay

当前仍不是真流式的卡点：

- OpenClaw CLI `openclaw agent --json` 仍然是 final-only 输出
- 主进程收到完整结果后才开始 pseudo-chunk replay
- 首字延迟仍然受 OpenClaw 执行时间限制
- 这轮优化的是"收到结果后的增量显示"和"HUD → overlay 交接体验"，不是后端真流式

验证：

- `npm run typecheck` 通过
- 对本轮修改文件执行定向 `eslint` 通过

给下一个 agent 的具体下一步：

1. 如果要做真正的 token streaming，需要调研 OpenClaw 是否有 gateway / websocket / internal event API 可直接接
2. 如果用户继续优化 answer overlay 视觉，可以继续收口 brand/spacing/留白，但不要把它改回聊天软件
3. 当前 agentWindow 和 ClawDesk Chat 共享同一个 `agentService` 单例，语音触发时两个 UI 会同时刷新；如果要分离，需要重构 agentService 支持多个独立会话实例

### 2026-04-18: ClawDesk Settings 第一轮落地 — 通用 / 服务商 / Skills / CLI 真数据接通

用户要求：

- 不再让 `Settings` 页面保持空壳
- 先落 4 个分组：
  - `通用`
  - `服务商`
  - `Skills`
  - `CLI`
- `Skills` 需要先同步本机已有技能，包含 Claude Code skills，并把 OpenClaw skills 同步需求记进架构
- `CLI` 页面先做“推荐 + 延迟检测”
- `通用` 先补：
  - 版本信息
  - GitHub 发布 / 自动更新状态
  - 浅色 / 深色 / 跟随系统
- `服务商` 先做“语音服务商 / 小文本处理服务商”的摘要样貌，不做复杂配置

本轮完成：

- 新增 [src/shared/types/clawdesk-settings.ts](/Users/chaosmac/Desktop/open-typeless/src/shared/types/clawdesk-settings.ts)
  - 定义 `themeMode / versionInfo / providerSummary / skillItem / cliToolDefinition / cliToolStatus / settingsOverview`
- 新增 [src/main/services/clawdesk/settings.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/clawdesk/settings.service.ts)
  - 为 `ClawDesk Settings` 提供最小主进程数据层
  - 能力包括：
    - 读取/保存主题模式（写入 `userData/clawdesk-settings.json`）
    - 读取版本信息（`app.getVersion()` + `package.json` + `process.versions`）
    - 读取服务商摘要（基于 `.env` / `process.env` 判断 `Volcengine` 和 `Ark refinement` 是否已配置）
    - 扫描技能目录：
      - `~/.codex/skills`
      - `~/.agents/skills`
      - `~/.openclaw/skills`
    - 读取 `SKILL.md`，提取技能名称、描述、路径、来源、命令名
    - 提供参考自 `CodePilot` 的 CLI catalog，并在主进程异步检测本机安装状态与版本
- 扩展 `ClawDesk` IPC / preload / renderer 类型：
  - [src/shared/constants/channels.ts](/Users/chaosmac/Desktop/open-typeless/src/shared/constants/channels.ts)
  - [src/main/ipc/claw-desk.handler.ts](/Users/chaosmac/Desktop/open-typeless/src/main/ipc/claw-desk.handler.ts)
  - [src/preload.ts](/Users/chaosmac/Desktop/open-typeless/src/preload.ts)
  - [src/types/global.d.ts](/Users/chaosmac/Desktop/open-typeless/src/types/global.d.ts)
  - 新增能力：
    - `getSettingsOverview`
    - `getThemeMode`
    - `setThemeMode`
    - `detectCliTools`
- 扩展 [src/renderer/clawdesk/stores/ui.ts](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/stores/ui.ts)
  - 增加 `themeMode`
  - `sidebarCollapsed` 继续本地持久化
  - `themeMode` 不走 renderer localStorage，主进程持久化为准
- 修改 [src/renderer/clawdesk/ClawDeskApp.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/ClawDeskApp.tsx)
  - 启动时从主进程读取主题模式
  - 把 `light / dark / system` 实际应用到 `document.documentElement`
- 重写 [src/renderer/clawdesk/pages/Settings.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/pages/Settings.tsx)
  - 页面改成 `左侧分组导航 + 右侧详情区`
  - `通用`
    - 版本管理
    - 发布脚本状态
    - 自动更新占位状态
    - 主题切换
  - `服务商`
    - `语音服务商`
    - `小文本处理服务商`
    - 仅摘要，不做表单
  - `Skills`
    - 搜索框
    - 左侧技能列表
    - 右侧详情区
    - 真实显示本机 Claude/Agents/OpenClaw 技能扫描结果
  - `CLI`
    - 推荐工具列表
    - 已安装工具列表
    - 延迟检测与手动重检

重要取舍：

- **OpenClaw skills 双向同步/删除**这轮没有直接实现
  - 只做了安全的读取与展示
  - 用户明确说这部分可以留后，但必须进架构
  - 已在 Settings 文案和 memory 里明确记录
- **服务商页这轮不做密钥编辑**
  - 当前只显示配置状态和摘要
  - 避免先做出“像能保存、其实没保存”的假表单
- **自动更新不假装已完成**
  - 当前只诚实显示：
    - 是否存在 `publish` script
    - 自动更新是否已配置（目前 `false`）

当前已知边界：

- `~/.openclaw/skills` 目录存在，但当前扫描时未发现真实 `SKILL.md` 文件；因此 OpenClaw skills 计数可能为 0
- `CLI` 目录是精简版，不是完整搬运 `CodePilot`
- `Settings` 还没有真正的“写服务商配置”“安装/删除技能”“安装 CLI 工具”能力

验证：

- `npm run typecheck` 通过
- 对本轮修改的 `ClawDesk Settings` 相关文件执行定向 `eslint` 通过

给下一个 agent 的具体下一步：

1. 继续实现 `OpenClaw skills` 的真实来源定位，确认它在当前集成里的读写边界，再决定如何做双向同步与删除联动
2. 如果用户继续推进 `CLI` 页面，可增加：
   - 工具详情面板
   - 安装指引 / 官网链接
   - 推荐来源说明
3. 如果用户继续推进 `服务商` 页面，可先接“只读配置摘要 + 跳转说明”，不要直接做不安全的密钥编辑

### 2026-04-18 23:xx - 修复黑屏问题
- **问题**：ClawDesk 启动后黑屏，`index.tsx` 引用 `./styles.css` 但文件不存在
- **修复**：创建 `src/renderer/clawdesk/styles.css`，包含 Tailwind 指令 + shadcn CSS 变量（light/dark 主题）
- **文件**：[src/renderer/clawdesk/styles.css](src/renderer/clawdesk/styles.css)

### 2026-04-19: Settings 重做 + Skills 独立页 + 占位页升级

用户要求：
- 按 CodePilot 的 Settings / Skills 管理方式重做设置板块
- 不要再出现 "Coming in Phase 2" 的粗糙占位
- 内容必须基于项目当前真实已有能力落地

已完成：

- **Skills.tsx 独立页（`/skills` 路由）全新实现**
  - 从 settings service 拉 `getSettingsOverview()` 获取真实 skills 数据
  - 顶部三张 stat 卡（Claude Code / Agents / OpenClaw 计数），点击可过滤
  - 左侧 source tabs + search + 技能列表，右侧详情面板
  - 支持重新扫描（调 `getSettingsOverview` 刷新）
  - 完整的空态处理：暂未发现技能 / 没有匹配结果

- **Settings.tsx 三大 section 升级**
  - `General`：新增**语音热键速查卡**（Right Ctrl 系列 + Cmd+Shift+Space），直接展示当前生效热键，对用户最有价值
  - `Skills`：改成 source tab 筛选 + 搜索 + 列表 + 详情面板（与独立 Skills 页风格一致）
  - `CLI`：新增安装 summary stats 行（已安装数 / 已收录数 / 推荐但未安装数），"已安装"区显示版本号和路径，"推荐安装"区只显示未安装工具

- **占位页升级（Models / Agents / Channels / Cron）**
  - 不再显示 "Coming in Phase 2"
  - 改成带图标、标题、说明文字 + 三张功能规划卡的优雅占位页
  - 内容基于当前项目真实边界，不凭空发明功能

涉及文件：
- `src/renderer/clawdesk/pages/Skills.tsx` — 全新实现
- `src/renderer/clawdesk/pages/Settings.tsx` — General / Skills / CLI 三 section 升级
- `src/renderer/clawdesk/pages/Models.tsx` — 优雅占位
- `src/renderer/clawdesk/pages/Agents.tsx` — 优雅占位
- `src/renderer/clawdesk/pages/Channels.tsx` — 优雅占位
- `src/renderer/clawdesk/pages/Cron.tsx` — 优雅占位

验证：`npm run typecheck` 通过

当前限制：
- Skills 数据依赖 `getSettingsOverview()`，扫描速度受 fs 和目录大小影响，首次可能稍慢
- CLI 检测采用延迟扫描（切到 CLI tab 时才触发），避免设置页打开变慢
- Models / Agents / Channels / Cron 仍是信息型占位，没有真实业务接线

### 2026-04-19: 全项目 review + debug（热键持久化 / lint 基线 / DevTools 行为）

用户要求：
- 完整 review 当前项目
- 把当前能复现的问题直接 debug 掉

本轮实际排查结果：
- `npm run typecheck` 通过
- `npm run package` 通过
- `npm run lint` 初始失败，主要是：
  - ClawDesk UI 组件使用 `@/...` alias，但当前 ESLint 配置不认识该 alias
  - 两个 shadcn 风格组件残留了 `react-refresh/only-export-components` 注释，但项目并未安装对应 ESLint rule
  - `Skills.tsx` 残留了 `react-hooks/exhaustive-deps` 注释，但项目并未安装对应 ESLint rule
  - 若干旧 push-to-talk service 残留未使用导入
- 真正的功能性 bug 主要在热键配置链路：
  - `clawdesk-settings.service.ts` 的 `readSettings()` 只返回 `themeMode`，会把已保存的 `hotkeyConfig` 丢掉
  - 结果是热键设置看似可保存，但重启后一定回退默认值
  - `hotkeyManager.apply()` 原实现先持久化、后重绑热键；若全局快捷键注册失败，会留下“磁盘配置已改、运行态只回滚一部分”的不一致状态
  - 在未授予 Accessibility 权限时，修改语音触发键会尝试立即 `voiceModeManager.reinitialize()`；这条路径风险较高，因为键盘 hook 初始化依赖系统权限
- 另一个用户可见问题：
  - `ClawDeskMainWindow` 创建时无条件打开 DevTools，打包后也会弹出，影响正式使用体验

已完成修复：
- 修复 [src/main/services/clawdesk/settings.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/clawdesk/settings.service.ts)
  - `readSettings()` 现在会保留并校验 `hotkeyConfig`
  - `setThemeMode()` / `setHotkeyConfig()` 都按“读当前配置 -> merge -> 写回”处理，避免互相覆盖
- 修复 [src/main/services/hotkey/hotkey-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/hotkey/hotkey-manager.ts)
  - 热键应用改成“先尝试运行态切换，成功后再持久化”
  - 注册新窗口快捷键失败时，会恢复旧快捷键，不写入坏配置
  - 语音触发键回绑失败时，会尝试回滚到旧值
  - 若未授予 Accessibility 权限，只保存配置，不立刻重绑 voice hook；等待后续有权限时再生效
- 修复 [src/main/windows/claw-desk.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/claw-desk.ts)
  - DevTools 仅在非打包环境自动打开
- 修复 lint 基线
  - 把 ClawDesk UI 组件里的 `@/...` alias 导入改成相对路径
  - 移除项目未安装 rule 对应的 ESLint 注释
  - 清理旧 push-to-talk service 的未使用导入
  - 顺手修了一个无意义正则转义和一个重复导入 warning
- 清理 [src/renderer/src/modules/asr/components/FloatingWindow.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/modules/asr/components/FloatingWindow.tsx)
  - 移除未使用 import / 变量，保持 lint 干净

验证结果：
- `npm run lint` 通过
- `npm run typecheck` 通过
- `npm run package` 通过

这轮 review 后仍保留的边界 / 风险：
- `checkToggleWindowConflict()` 里的 `globalShortcut.isRegistered()` 更适合检查当前 app 自己是否已注册；对“别的 app 占用了快捷键”这类场景并不完全可靠
  - 不过真正保存时仍会走一次 `globalShortcut.register()`，失败会被回滚，所以最终行为是安全的
- 旧的 push-to-talk service 文件还在仓库中，虽然当前热键主控已经是 `VoiceModeManager`，但这些旧文件继续存在会增加后续 agent 的理解成本
- `package.json` 当前已有未提交的产品元信息调整（`productName` / `description`），这不是本轮 debug 的核心，但需要后续提交时一起确认

给下一个 agent 的具体下一步：
1. 如果继续收口热键功能，可把 `checkToggleWindowConflict()` 的占用检测改成“保守提示 + 保存时真实注册验证”，避免给用户误导性的“已被其他应用占用”判断
2. 评估是否删除或显式标注旧的 push-to-talk service，减少历史实现对后续维护的干扰
3. 如果用户接下来要做正式发布，先确认 `package.json` 的产品元信息、图标与 `forge.config.ts` 打包资源是否统一，再做签名/分发链路

### 2026-04-19: 修复 ClawDesk / 交互面板页面空白与启动警告

用户要求：
- 当前打开的交互面板页面弹不出来
- 希望把截图里能看到的这些前端启动问题一起处理掉

排查与判断：
- 从截图看，`clawdesk.html` 已经成功加载到 React，但控制台只有 warning，没有实际 runtime error
- 这类“空白页但无异常”的情况，最像是路由初始命中失败
- 当前 [src/renderer/clawdesk/ClawDeskApp.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/ClawDeskApp.tsx) 使用 `HashRouter`，而窗口直接打开的 URL 是 `http://localhost:5175/clawdesk.html`，初始没有 `#/`
- 在这种入口方式下，首次打开时 route tree 可能没有 concrete match，表现就是整个窗口空白但控制台基本干净
- 截图里的另外两个 warning 来自 React Router v6 future flags 未显式开启
- 另一个显式 warning 来自 HTML 入口页没有 CSP

已完成修复：
- 修改 [src/renderer/clawdesk/ClawDeskApp.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/ClawDeskApp.tsx)
  - 启动时如果没有 hash，自动规范化到 `#/`
  - 根路由改成 `index` route，而不是 `path="/"` 形式
  - 添加 `path="*"` fallback，未知路径统一重定向回首页
  - 为 `HashRouter` 打开：
    - `v7_startTransition`
    - `v7_relativeSplatPath`
  - 这样可以消除截图里的两个 React Router future warnings
- 修改入口 HTML：
  - [clawdesk.html](/Users/chaosmac/Desktop/open-typeless/clawdesk.html)
  - [floating.html](/Users/chaosmac/Desktop/open-typeless/floating.html)
  - [index.html](/Users/chaosmac/Desktop/open-typeless/index.html)
  - 添加显式 `Content-Security-Policy`，避免窗口以“无 CSP”模式启动

验证：
- `npm run lint` 通过
- `npm run typecheck` 通过
- `npm run package` 通过

剩余注意点：
- 当前 CSP 是为本地 Vite / Electron 开发环境放宽后的版本，允许 `localhost` 和 `ws://localhost:*`
- 如果后续进入签名 / 发布阶段，建议再按生产资源来源收紧 CSP，而不是直接沿用 dev 版

给下一个 agent 的具体下一步：
1. 如果用户反馈交互面板仍偶发空白，下一步优先检查 `agentWindow` 创建后的 `did-finish-load` 与 rendererReady 缓冲逻辑，而不是再回头怀疑主路由
2. 若用户想继续清控制台，把 dev 环境下与 Electron 安全提示相关的剩余 warning 和 production CSP 区分处理，避免为消 warning 反而破坏本地开发体验

### 2026-04-19: 修复 Right Ctrl 偶发失效（stuck key 状态）

用户反馈：
- 右侧 `Control` 键经常偶发无法再呼出语音
- 表现是按键像“没被系统识别到”，整个语音唤起链条失效

定位结论：
- 这不是热键配置被改掉，也不是 `VoiceModeManager` 没注册
- 更像是底层键盘 hook 偶发丢失 `keyup`
- [src/main/services/keyboard/keyboard.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/keyboard/keyboard.service.ts)
  - 内部同时维护：
    - `activeHandlers`
    - 每个 trigger 的 `state.isHeld`
  - 如果某次 `Right Ctrl` 的 `keyup` 丢了，后续再次按下时会被当成“这个键还在按着”，直接返回
  - 于是用户看到的就是：右 Ctrl 完全呼不出来，像系统没识别一样

已完成修复：
- 在 [src/main/services/keyboard/keyboard.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/keyboard/keyboard.service.ts) 增加 stuck key 自恢复逻辑
  - 新增 `STUCK_KEY_RESET_MS = 3000`
  - 若同一个 trigger 再次收到 `keydown` 时，内部状态仍是 `isHeld=true`，并且已经持续超过 3 秒
  - 则认为上一次 `keyup` 丢失，自动清理：
    - `longPressTimer`
    - `state.isHeld`
    - `state.longPressTriggered`
    - `activeHandlers`
  - 清理后继续按正常流程处理这次按键
- 会打 `Recovered stuck key state` 日志，后续如果还要继续追 uiohook 层问题，可以直接搜这条日志

验证：
- `npm run lint` 通过
- `npm run typecheck` 通过

剩余注意点：
- 这是“自恢复”补丁，不是从根上解决 uiohook 偶发丢失 `keyup` 的底层问题
- 但对用户体验最关键的一点已经补上了：以后再卡死，不需要重启 app，下一次按键会在超时后自动把状态救回来

给下一个 agent 的具体下一步：
1. 如果用户后续仍反馈右 Ctrl 偶发不稳定，建议把 `keyboard.service` 的 keydown/keyup 原始事件和修复日志一起落到文件，确认是不是某类键盘、IME 或输入法环境更容易丢 `keyup`
2. 若要继续增强鲁棒性，可再补一层“应用重新获得焦点 / 权限状态变化时主动清空 stale key 状态”的恢复逻辑

### 2026-04-19: 澄清开发态显示名为 Electron + 输入监控权限引导

用户反馈：
- 从终端启动项目时，Dock / 切换器底部显示的是 `Electron`，不是 `open-typeless`
- 点击“检查输入监控权限”后，系统里也找不到当前应用，不知道该把谁加入输入监控

核对结果：
- 这不是产品名配置错误
- [package.json](/Users/chaosmac/Desktop/open-typeless/package.json) 里 `productName` 已是 `OpenTypeless`
- 打包产物的 Info.plist 也已经是：
  - `CFBundleDisplayName = OpenTypeless`
  - `CFBundleName = OpenTypeless`
  - `CFBundleExecutable = OpenTypeless`
- 因此**打包后的 app 名称是对的**
- 用户在开发态看到 `Electron`，是因为 `electron-forge start` 本质上跑的是 Electron 开发运行器；macOS 对 Dock 名称、输入监控主体、权限归属的记录，往往会落在 `Electron.app` 而不是业务名上

已完成改进：
- 修改 [src/main.ts](/Users/chaosmac/Desktop/open-typeless/src/main.ts)
  - 在开发模式下点击“检查输入监控权限”时，会先弹出明确说明：
    - 当前权限主体大概率是 `Electron.app`
    - 系统设置里加号后优先找 `Electron` / `Electron.app`
    - 如果不好找，可参考运行时 `process.execPath`
    - 授权后必须完全退出并重启 app

对用户体验的真实判断：
- **不建议为了开发态 Dock 名称是 Electron 去做激进改造**
- 这不是隐藏 bug，本质是 Electron dev runner 的表现
- 真正需要保证的是：
  - 打包态名字正确
  - 开发态权限说明足够明确
- 目前这两件事都已经补上

给下一个 agent 的具体下一步：
1. 如果用户后续想减少开发态困惑，可考虑提供一个 `npm run dev:packaged` 或“先 package 再启动本地 app bundle”的调试脚本，让 macOS 始终把权限挂到 `OpenTypeless.app`
2. 若继续优化权限引导，可增加“在 Finder 中显示当前 Electron.app 路径”的按钮，而不只是文本说明

### 2026-04-19: 给出真实 OpenTypeless.app 路径 + packaged 启动脚本

用户进一步反馈：
- 不想再听“打包出来的 app”，而是需要一个明确可打开的 `OpenTypeless.app`
- 之前按提示尝试 `process.execPath`，结果走成了错误路径，看到 “Unable to find Electron app … /process.execPath”

已完成改进：
- 确认当前真实 app bundle 路径：
  - `/Users/chaosmac/Desktop/open-typeless/out/OpenTypeless-darwin-arm64/OpenTypeless.app`
- 新增脚本：
  - [scripts/open-packaged-app.sh](/Users/chaosmac/Desktop/open-typeless/scripts/open-packaged-app.sh)
  - 作用：若未打包则先 `npm run package`，随后直接 `open` 这个 `OpenTypeless.app`
- `package.json` 新增：
  - `npm run open:app`
- 修改 [src/main.ts](/Users/chaosmac/Desktop/open-typeless/src/main.ts)
  - 开发态点击权限按钮时，如果本地已存在 `OpenTypeless.app`
  - 会优先提示用户去用这个真实 app bundle
  - 并提供“在 Finder 中显示 OpenTypeless.app”的按钮
- 同时调用 `app.setName('OpenTypeless')`
  - 尽量让开发态进程自身也使用产品名，而不是继续裸露为 Electron

当前真实建议：
- 如果用户只是想稳定使用热键和权限，不要继续依赖 `electron-forge start`
- 直接运行：
  - `npm run open:app`
- 然后在系统设置里把这个 `OpenTypeless.app` 加进输入监控

给下一个 agent 的具体下一步：
1. 如果用户后续还抱怨 Dock 名称或权限主体仍显示 Electron，说明 `app.setName()` 对 macOS dev runner 不够，需要进一步改成“开发时也从 app bundle 启动”的脚本流
2. 若继续打磨体验，可在 ClawDesk 设置页里增加一个“Reveal OpenTypeless.app”按钮，避免用户再从终端和文件夹里手动找

### 2026-04-19: Models 引导增强 + Skills 独立滚动 / 详情 / 编辑

用户要求：

- `Models` 页面不要再是占位，需要把当前实际可用的“语音服务商 / 小文本服务商”状态与配置引导做出来
- `Skills` 页面的左右两侧要独立滚动
- `Skills` 详情需要显示更清楚的概述与实际内容，不再突出“来源路径”
- `Skills` 需要支持在 UI 中直接修改本机技能内容
- 参考 `CodePilot` 的交互方式，但适配当前 `ClawDesk` 壳层

本轮完成：

- 重做 [src/renderer/clawdesk/pages/Models.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/pages/Models.tsx)
  - 不再是静态占位
  - 直接读取 `window.api.clawDesk.getSettingsOverview()`
  - 展示当前两类真实服务商：
    - `Volcengine ASR`
    - `Ark Lightweight Text Model`
  - 每张卡片显示：
    - 已检测到配置 / 未检测到配置
    - 当前摘要
    - 点击后打开右侧 `Sheet` 配置引导
  - `Sheet` 中包含：
    - 需要配置的环境变量
    - 配置步骤说明
    - 一键打开 `.env`
    - 一键打开 `.env.example`
    - 一键打开官方文档
- 扩展 [src/main/services/clawdesk/settings.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/clawdesk/settings.service.ts)
  - `providerSummary` 现在不只是 `configured/detail`
  - 还会提供：
    - `statusLabel`
    - `envKeys`
    - `envFilePath`
    - `envExamplePath`
    - `guidance`
    - `documentationUrl`
  - `voiceConfigured` 改为同时检查：
    - `VOLCENGINE_APP_ID`
    - `VOLCENGINE_ACCESS_TOKEN`
    - `VOLCENGINE_RESOURCE_ID`
  - `skills` 现在会标记 `editable`
  - 新增：
    - `getSkillDetail(skillId)`
    - `saveSkillContent(skillId, content)`
  - 当前只允许编辑：
    - `~/.codex/skills`
    - `~/.agents/skills`
  - `~/.openclaw/skills` 继续只读
- 扩展 `ClawDesk` IPC / preload / 全局类型：
  - [src/shared/constants/channels.ts](/Users/chaosmac/Desktop/open-typeless/src/shared/constants/channels.ts)
  - [src/main/ipc/claw-desk.handler.ts](/Users/chaosmac/Desktop/open-typeless/src/main/ipc/claw-desk.handler.ts)
  - [src/preload.ts](/Users/chaosmac/Desktop/open-typeless/src/preload.ts)
  - [src/types/global.d.ts](/Users/chaosmac/Desktop/open-typeless/src/types/global.d.ts)
  - 新增能力：
    - `getSkillDetail`
    - `saveSkillContent`
    - `openPath`
    - `openExternal`
- 升级 [src/renderer/clawdesk/pages/Settings.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/pages/Settings.tsx) 的 `SkillsSection`
  - 左右两侧改成固定高度、各自独立滚动
  - 左侧列表现在不会再把右侧详情带出视野
  - 右侧详情新增：
    - `概述`
    - `详细内容`（Markdown 渲染）
    - `Editable / Read-only` 状态
  - 详情里移除了“来源路径”展示
  - 对可编辑 skill 新增：
    - `预览`
    - `编辑`
    - `保存`
  - 切换 skill 时如果有未保存改动，会弹确认框避免误丢内容
- 修改 [src/renderer/clawdesk/components/layout/Sidebar.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/components/layout/Sidebar.tsx)
  - 把 `Models`
  - 和 `Settings`
  - 重新放回主导航，避免做完页面却只能手动改 hash 才能访问
- 新增依赖：
  - `react-markdown`
  - `remark-gfm`

重要取舍：

- `Models` 这轮做的是“引导和直达”，不是可视化编辑 `.env`
  - 这样能先解决用户“不知道去哪配、怎么看状态”的问题
  - 同时避免在 renderer 里做一套不安全的密钥表单
- `Skills` 编辑当前只做“安全范围内写回本机文件”
  - OpenClaw skills 双向同步 / 删除联动仍然没有直接实现
  - 原因不变：这是外部目录写操作，需要先确认 OpenClaw 那边的真实边界
- `Skills` 详情改成 Markdown 展示后，信息密度和可读性明显比“路径 + 来源”更高

验证：

- `npm install react-markdown remark-gfm`
- `npm run typecheck` 通过
- 对本轮修改的 `Models / Settings / Settings service / IPC / preload` 相关文件执行定向 `eslint` 通过

给下一个 agent 的具体下一步：

1. 如果用户继续推进 `Models`，可以在保持安全前提下做“读取 .env 当前值摘要”，但不要直接把敏感 key 明文露到 UI
2. 如果用户继续推进 `Skills`，下一步最自然的是：
   - 增加保存成功 toast
   - 增加 preview/edit/split 三态
   - 再评估 OpenClaw skills 的安全写回策略
3. 如果用户想把服务商配置做得更顺手，可以考虑增加“复制变量名”“复制文档链接”而不是立即做密钥编辑器

### 2026-04-19: CLI 交互补强 — 检测状态收口 + 详情面板 + 一键送进 Chat

用户反馈：

- `CLI` 页面看起来一直在检测，但没有明确结果，体感像没真的检测
- 参考的 `CodePilot` 交互没有落到位
- 期望：
  - 点击工具查看详细信息
  - 点击加号后自动生成安装提示
  - 安装提示直接同步到 `ClawDesk Chat / OpenClaw` 对话流里
  - 提示里包含安装命令、权限说明、安装后认证/初始化引导

本轮完成：

- 参考 `CodePilot` 的以下实现思路做了适配：
  - `src/components/cli-tools/CliToolsManager.tsx`
    - 尤其是 `handleInstall()` 生成安装提示文本的模式
  - `src/components/cli-tools/CliToolDetailDialog.tsx`
    - 尤其是“详情面板 + 安装动作 + 外链文档”的结构
- 扩展 [src/shared/types/clawdesk-settings.ts](/Users/chaosmac/Desktop/open-typeless/src/shared/types/clawdesk-settings.ts)
  - `ClawDeskCliToolDefinition` 现在新增：
    - `installCommand`
    - `detailIntro`
    - `docsUrl`
    - `repoUrl`
    - `authRequired`
    - `postInstallNotes`
- 扩展 [src/main/services/clawdesk/settings.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/clawdesk/settings.service.ts)
  - CLI catalog 现在不只是“名字 + 描述”
  - 每个工具都带更完整的：
    - 安装命令
    - 详情概述
    - 文档 / 仓库链接
    - 是否需要登录 / 认证
    - 安装后补充说明
  - `detectCliTools()` 改为 `Promise.allSettled`
    - 某一个工具检测失败时，不会把整批 CLI 检测一起拖挂
    - 会按工具粒度 fallback 成 `installed:false`
- 扩展 `ClawDesk` IPC / preload / global types
  - 新增：
    - `openExternal`
  - 让 renderer 能直接打开工具文档 / GitHub 链接
- 修改 [src/renderer/clawdesk/stores/chat.ts](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/stores/chat.ts)
  - 新增 `queuedPrompt`
  - 新增：
    - `queuePrompt(text, autoSend)`
    - `consumeQueuedPrompt()`
  - 目的：
    - 允许从 `Settings > CLI` 触发安装提示
    - 再在 `Chat` 页面挂载后可靠地注入 / 发送，避免路由切换时丢消息
- 修改 [src/renderer/clawdesk/pages/Chat.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/pages/Chat.tsx)
  - 进入 Chat 时会消费 `queuedPrompt`
  - 支持自动把 CLI 安装提示作为真实消息发给当前 OpenClaw agent
- 修改 [src/renderer/clawdesk/pages/Settings.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/pages/Settings.tsx)
  - `CLI` section 现在支持：
    - 检测错误显示，不再只会无限挂“检测中”
    - 推荐工具卡片上：
      - `查看详细信息`
      - `添加到 Chat`
    - 详情 `Sheet` 中展示：
      - 工具概述
      - 安装建议
      - 安装命令
      - 安装后补充说明
      - 官方文档 / GitHub 外链
      - 一键把安装提示送进 Chat Workspace
  - 自动检测逻辑新增：
    - `cliDetectionAttempted`
    - `cliDetectionError`
    - 避免失败时因为 `statuses.length === 0` 反复循环检测

重要取舍：

- 这轮做的是“把安装提示送进 Chat 并自动提交”，不是在 Settings 里直接执行安装命令
  - 这样符合当前项目“由 OpenClaw / agent 驱动执行”的边界
  - 也更接近用户想要的“人家点加号后会自动生成安装请求并送去对话框”
- CLI 检测问题这轮按“体验收口 + 容错增强”处理：
  - 仍然保留延迟检测
  - 但不再允许失败时一直停留在模糊的 loading 状态

验证：

- `npm run typecheck` 通过
- 对本轮修改的 `CLI / Chat / chat store / settings service / IPC` 相关文件执行定向 `eslint` 通过

给下一个 agent 的具体下一步：

1. 如果用户继续推进 `CLI`，可以加：
   - 安装成功 / 发送成功 toast
   - “复制安装命令”
   - 多安装方式选择（brew / npm / pipx）
2. 如果用户想更贴近 `CodePilot`，下一步最值得补的是：
   - CLI 工具详情页中的使用示例
   - `Try in Chat` / `Install in Chat` 的更细分动作
3. 如果后续确认 `openclaw` 或某些工具有更准确的官方安装命令，应优先修正 catalog，而不是把安装逻辑散落到 UI 层

## 2026-04-19 - Stale dev Electron quit fix and cleanup helper

用户要求：

- 用户反馈桌面上残留了一个名为 `Electron` 的窗口 / Dock 项，无法正常退出。
- 截图显示窗口内容已经退化成黑底 + `chrome-error://chromewebdata/` 的 DevTools 页面，说明渲染页已断开但主进程还活着。
- 用户希望搞清楚为什么“终端命令停了，Electron 还是关不掉”，并把这个问题修掉。

本轮改动：

- 新增 [src/main/app-lifecycle.ts](/Users/chaosmac/Desktop/open-typeless/src/main/app-lifecycle.ts)
  - 引入全局 `isAppQuitting` 标记。
  - `before-quit` 时置位，供所有窗口在真正退出时放行关闭，而不是继续 `preventDefault()`.
- 修改以下窗口管理器的 `close` 逻辑：
  - [src/main/windows/agent.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/agent.ts)
  - [src/main/windows/floating.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/floating.ts)
  - [src/main/windows/topbar.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/topbar.ts)
  - 这些窗口平时仍保持“点关闭只隐藏”，但在应用真正退出时不再拦截关闭事件。
- 修改 [src/main.ts](/Users/chaosmac/Desktop/open-typeless/src/main.ts)
  - 增加 `markAppQuitting()` 调用。
  - 将清理逻辑挂到 `before-quit`，并给 `cleanup()` 加幂等保护，避免重复释放导致副作用。
- 新增 [scripts/stop-dev-electron.sh](/Users/chaosmac/Desktop/open-typeless/scripts/stop-dev-electron.sh)
  - 专门清理由当前项目 `node_modules/electron/dist/Electron.app/...` 启动的开发态 Electron。
- 更新 [package.json](/Users/chaosmac/Desktop/open-typeless/package.json)
  - 新增 `npm run stop:dev`
  - 保留之前的 `npm run open:app`

关键判断与取舍：

- 这次看到的 `Electron` 不是打包后的 `OpenTypeless.app` 崩成 Electron，而是旧的开发态 Electron 进程残留在 Dock。
- 根因不是单一“前端白屏”，而是：
  - dev server 断掉后，窗口退化成 `chrome-error://chromewebdata/`
  - 同时多个窗口的 `close` 监听会 `preventDefault()` 并隐藏窗口
  - 结果 `app.quit()` 期间窗口也被拦住，形成“表面退出，实际进程还活着”
- 因此这轮不是只加一个 kill 脚本，而是同时修：
  - 生命周期退出放行
  - 手动清理残留开发 Electron 的命令

验证：

- `npm run stop:dev` 已执行，确认当前项目路径下的开发态 Electron 残留进程已被清掉。
- `ps aux` 检查时，已不再看到 `open-typeless/node_modules/electron/dist/Electron.app/...` 的残留进程。
- `npm run lint` 通过
- `npm run typecheck` 通过

已知情况 / 后续建议：

- 只要继续使用 `npm start`，开发态宿主依然会是 Electron runtime；这属于开发方式本身，不是产品名配置错误。
- 如果用户要稳定使用权限、热键和真实应用名，优先引导其使用：
  - `npm run open:app`
  - 对应的真实 bundle 为 `/Users/chaosmac/Desktop/open-typeless/out/OpenTypeless-darwin-arm64/OpenTypeless.app`
- 下一个 agent 若继续跟进，可考虑：
1. 在设置页加入“停止残留开发态 Electron”按钮。
2. 在 dev 模式检测到 `chrome-error://chromewebdata/` 时，自动提示用户重新拉起 Vite 或改用 `open:app`。

## 2026-04-19 - Stable installed test app workflow

用户要求：

- 用户不想再区分 dev Electron、`out` 目录 bundle、临时启动方式。
- 用户明确希望项目变成“真实可用的 APP”，每次修完 bug 后都能一键打开测试。
- 用户同时提到 `out` 里的 app 之前点开会报错，以及当前图标不够理想。

本轮改动：

- 修复 [clawdesk.html](/Users/chaosmac/Desktop/open-typeless/clawdesk.html)
  - 之前它被错误改成直接引用某次构建后的哈希产物：
    - `./assets/clawdesk-*.js`
    - `./assets/clawdesk-*.css`
  - 这会导致后续重新 `package` 时，Rollup/Vite 找不到旧 hash 文件，打包直接失败。
  - 现在恢复成真正的 Vite 源入口：
    - `/src/renderer/clawdesk/index.tsx`
- 修复 [src/main/windows/claw-desk.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/claw-desk.ts)
  - 给 `loadHome()` 增加 `homeLoadPromise`
  - 避免 `create()` 里的 preload 和 `show()` 里的再次加载互相打断，消除 packaged / dev 下反复出现的 `ERR_ABORTED` 首页加载警告
- 新增 [scripts/install-packaged-app.sh](/Users/chaosmac/Desktop/open-typeless/scripts/install-packaged-app.sh)
  - 顺序：
    1. 清理残留 dev Electron
    2. 清理正在运行的旧 `OpenTypeless.app`
    3. 重新 `npm run package`
    4. 安装到 `~/Applications/OpenTypeless.app`
    5. 直接打开这个安装后的 app
- 更新 [package.json](/Users/chaosmac/Desktop/open-typeless/package.json)
  - 新增 `npm run install:app`

当前推荐测试入口：

- 稳定测试版 app 路径：
  - `/Users/chaosmac/Applications/OpenTypeless.app`
- 每次修完 bug 后，推荐由 agent 执行：
  - `npm run install:app`
- 这样用户只需要点同一个 `~/Applications/OpenTypeless.app`，不再依赖 `out` 目录里的瞬时打包产物

图标结论：

- 项目当前已经有可用图标资源：
  - [assets/icon.icns](/Users/chaosmac/Desktop/open-typeless/assets/icon.icns)
- 已验证安装后的 app 实际使用的图标文件与该资源 hash 一致
  - 安装后的 bundle 资源仍命名为 `electron.icns`，但内容已经是自定义的 `icon.icns`
- 如果用户后续提供更好的品牌图标，直接替换 `assets/icon.icns` 即可重新打包

验证：

- `npm run lint` 通过
- `npm run typecheck` 通过
- `npm run install:app` 通过
- 安装路径确认：
  - `/Users/chaosmac/Applications/OpenTypeless.app`
- 运行进程确认：
  - 当前启动的是 `/Users/chaosmac/Applications/OpenTypeless.app/Contents/MacOS/OpenTypeless`
- 最新 `OpenTypeless` 日志未再出现 packaged `clawdesk.html` 的 `ERR_ABORTED` 首页加载警告

给下一个 agent 的具体下一步：

1. 如果用户对当前图标不满意，优先让用户提供新的 `1024x1024` PNG 或 `.icns`，然后替换 `assets/icon.icns`。
2. 如果希望更像正式产品，可继续做：
   - 将 `~/Applications/OpenTypeless.app` 固定到 Dock
   - 增加一个 repo 内 “刷新测试版 APP” 按钮或设置项
3. 若后续仍有“点击 app 没反应”的个别案例，优先检查：
   - `~/Library/Logs/OpenTypeless/main.log`
   - 是否有旧实例尚未退出

## 2026-04-21 Command 模式胶囊立即隐藏修复

用户诉求：

- 用户要求只调整 `Right Ctrl + Shift` 的 Command 模式体验。
- 当 Command 模式录音结束并弹出透明对话框后，底部黑色胶囊不应该继续停留。
- 如果之后想补充命令，用户会再次按一次 `Right Ctrl + Shift`，不需要保留胶囊作为持续入口。

本轮改动：

- 修改 [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts)
  - 仅调整 `stopCommand()` 这条链路。
  - 原逻辑在 Command 模式提交后调用 `floatingWindow.deferHide()`，会让胶囊一直等到回答首屏出现后才消失。
  - 现改为在 `agentWindow.showWithContext(context)` 后立即调用 `floatingWindow.forceHide()`。
  - 保留 Quick Ask 与其他模式现有行为，不扩大改动范围。

决定与取舍：

- 没有改 `IPC_CHANNELS.AGENT.FIRST_CHUNK_VISIBLE` 的全局逻辑，因为它仍可能被其他路径使用。
- 这次只把 Command 模式从“等待首 chunk 再隐藏”改成“透明窗出现即隐藏”，避免误伤 Quick Ask 或其他 overlay 节奏。

验证：

- `pnpm exec eslint src/main/services/push-to-talk/voice-mode-manager.ts` 通过
- `pnpm -s typecheck` 通过

已知情况 / 后续建议：

- 需要用户实际回归确认：`Right Ctrl + Shift` 进入 Command 模式后，透明窗出现时底部胶囊是否已经立即消失。
- 如果用户后续希望 Quick Ask (`Right Ctrl + Space`) 也采用同样行为，再单独改那条路径，不要和本次修复混在一起。

## 2026-04-21 Dictation 成功插字后立即隐藏修复

用户诉求：

- 用户反馈 `Right Ctrl` 普通录音模式在第二次按键结束录音后，会先进入 `Processing` 胶囊状态。
- 这个阶段允许存在，但当文字已经处理完成并成功插入输入框后，胶囊应该立刻消失。
- 当前实际行为是插字成功后还会额外停留约 1 到 2 秒，用户希望去掉这段延迟。

本轮改动：

- 修改 [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts)
  - 仅调整 `stopDictation()` 的成功收尾分支。
  - 原逻辑在 `textInputService.insert(refined)` 成功后调用 `floatingWindow.sendStatus('done')`，这会触发浮窗内部的 auto-hide 定时器，因此出现额外延迟。
  - 现改为保留 `processing -> routing -> executing` 过程，但在插字成功后直接调用 `floatingWindow.forceHide()`，使胶囊立即消失。
- 更新 [src/main/services/push-to-talk/voice-mode-manager.test.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.test.ts)
  - 新增测试，确保普通 Dictation 成功插字后会立即 `forceHide()`，并且不再发送 `done` 状态。

决定与取舍：

- 没有调整录音、转写、润色、插字这条业务流程本身，只改了最终收尾时机。
- 保留 `Processing` 和中间态展示，符合用户“处理时可以显示，文字进框后立即消失”的要求。

验证：

- `pnpm exec vitest run src/main/services/push-to-talk/voice-mode-manager.test.ts` 通过
- `pnpm exec eslint src/main/services/push-to-talk/voice-mode-manager.ts src/main/services/push-to-talk/voice-mode-manager.test.ts` 通过
- `pnpm -s typecheck` 通过

已知情况 / 后续建议：

- 需要用户实际回归确认：`Right Ctrl` 结束录音后，胶囊是否会在文字插入输入框的同一时刻直接消失。
- 如果用户后续还想把“插字失败”场景也做成更短暂的错误提示再自动收起，可以再单独收紧错误态停留时间。

## 2026-04-25 Mini 方向审计（仅审计，不改功能代码）

用户诉求：

- 项目方向正式切换为 `OpenTypeless Mini`。
- 目标不再是完整 `ClawDesk` 桌面大面板，而是轻量 macOS 菜单栏语音热键入口，连接 `OpenClaw / OpenClaw Gateway`。
- 本轮只做第一阶段审计，不改功能代码；需要明确：
  - Mini 必留核心模块
  - 可隐藏 / 可废弃的大 UI 模块
  - 暂时不能删除的耦合模块
  - 热键到插字的完整录音链路
  - packaged app 中录音资源是否可能缺失

审计结论摘要：

- 当前 Mini 的真实核心仍然完整存在，主链路集中在：
  - `src/main.ts`
  - `src/main/services/keyboard/keyboard.service.ts`
  - `src/main/services/push-to-talk/voice-mode-manager.ts`
  - `src/main/services/asr/**`
  - `src/main/services/agent/dictation-refinement.service.ts`
  - `src/main/services/agent/lightweight-refinement-client.ts`
  - `src/main/services/agent/dictionary.service.ts`
  - `src/main/services/text-input/text-input.service.ts`
  - `src/preload.ts`
  - `src/renderer.ts`
  - `src/renderer/src/modules/asr/**`
  - `src/main/windows/floating.ts`
  - `src/main/windows/agent.ts`
  - `src/main/services/permissions/**`
- 当前默认启动仍然是 `ClawDesk` 大窗口：
  - `app.on('ready')` 中会执行 `clawDeskMainWindow.create(); clawDeskMainWindow.show();`
  - 这是后续第二阶段和第三阶段需要收缩的主入口。
- `Command` 当前真实实现与旧架构描述已经不一致：
  - 代码里 `Right Ctrl + Shift` 停止录音后走的是 `agentWindow.showWithContext(...) + sendExternalSubmit(...)`
  - 当前并没有走 `topbarWindow.showRunning/showCompleted` 的 silent tray path
  - 因此 `topbarWindow`、`trayStateService`、`commandResultStore` 目前更像残留 / 半废弃能力
- `ClawDesk` 大 UI 主要集中在：
  - `src/renderer/clawdesk/**`
  - `src/main/windows/claw-desk.ts`
  - `src/main/ipc/claw-desk.handler.ts`
  - `src/main/services/clawdesk/settings.service.ts`
  - 其中包含 sidebar、Chat Workspace、Sessions、Workspace、Models、Skills、CLI catalog 等完整桌面壳
- packaged app 录音资源现状：
  - `out/OpenTypeless-darwin-arm64/OpenTypeless.app/Contents/Resources/app.asar` 内已确认包含：
    - `/.vite/build/main.js`
    - `/.vite/build/preload.js`
    - `/.vite/renderer/main_window/index.html`
    - `/.vite/renderer/floating_window/floating.html`
    - `/.vite/renderer/clawdesk_window/clawdesk.html`
  - `.env` 与 `tray-icon.png` 也已存在于 `Contents/Resources/`
  - `app.asar.unpacked` 中已确认存在：
    - `uiohook-napi`
    - `@xitanggg/node-insert-text-*`
  - 说明“打包时录音资源完全缺失”目前不是主要风险，真正风险更偏向运行入口和窗口耦合。

风险 / 开放问题：

- 根目录不存在用户提到的 `opentypeless_handover_summary.md`，本轮只能基于最新 `CLAUDE.md` 和实际代码做审计。
- `src/preload.ts` 当前把 `ASR / Agent / ClawDesk / Topbar / ConfirmOverlay` API 全部暴露在一个 preload 里，Mini 收缩时要小心不要误伤 recorderWindow 和 floatingWindow。
- `floating.html` 当前承载 4 种模式：
  - 默认 HUD
  - `?mode=agent`
  - `?mode=topbar`
  - `?mode=confirm`
  Mini 化时不能简单删掉 `agent/topbar/confirm` 入口，必须先确认运行时引用是否已经切断。
- `src/main/ipc/claw-desk.handler.ts` 里除了大 UI 设置能力，还挂着 `CLAW_DESK.VOICE_INPUT_TOGGLE/STOP`，因此第二阶段只能降级、不能整文件删除。

给下一个 agent 的建议顺序：

1. 先把 `app.on('ready')` 默认启动入口从 `clawDeskMainWindow.show()` 改成 tray / mini-only，而不是先删页面。
2. 保留 `floatingWindow + recorderWindow + preload + renderer.ts + ASR IPC` 整条录音链路原样不动。
3. 保留 `agentWindow`，因为当前 `Command` 和 `Quick Ask` 都还依赖它。
4. 先把 `src/renderer/clawdesk/**` 和 `clawDeskMainWindow` 变成可选入口 / deprecated，再决定是否进一步物理删除。
5. 新增 `docs/PROJECT_SCOPE_MINI.md` 时，要明确：
   - Mini 必留窗口
   - 暂缓删除的耦合模块
   - 当前已废弃但仍在仓库里的模块

## 2026-04-25 第二阶段：Mini Mode 安全收缩

用户诉求：

- 执行第二阶段“安全收缩”，但不能删除录音主链路文件，也不能删除 `recorderWindow / ASR / keyboard / IPC / preload` 相关文件。
- 不做整仓 git 回退。
- 默认启动模式切换为 `Mini Mode`：
  - 启动后只出现菜单栏图标
  - 不自动打开 `ClawDesk` 主窗口
  - 旧入口保留在菜单中，作为 `Legacy ClawDesk / Debug UI`
- 复杂 UI 模块只标记 deprecated，不物理删除。
- 新增 `docs/PROJECT_SCOPE_MINI.md`
- 明确项目优先级：
  - `P0` 录音主链路
  - `P1` packaged app 集成
  - `P2` OpenClaw Gateway 接入
  - `P3` Mini Settings
  - `P4` 旧 ClawDesk UI 清理

本轮改动：

- 修改 [src/main.ts](/Users/chaosmac/Desktop/open-typeless/src/main.ts)
  - `app.on('ready')` 中不再自动执行 `clawDeskMainWindow.create(); clawDeskMainWindow.show();`
  - 保留 `createRecorderWindow()`、`floatingWindow.create()`、`agentWindow.create()`，确保语音链路热启动能力不受影响
  - tray tooltip 改为 `OpenTypeless Mini`
  - tray 菜单里的旧主窗口入口改名为：
    - `打开 Legacy ClawDesk` / `隐藏 Legacy ClawDesk`
    - `Legacy ClawDesk / Debug UI`
  - `app.on('activate')` 不再自动弹出 ClawDesk，保持 menubar-first 行为
- 修改 [src/main/windows/claw-desk.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/claw-desk.ts)
  - 在文件头部明确标记这是 `Mini` 方向下保留的 legacy / debug UI
- 修改 [src/renderer/clawdesk/ClawDeskApp.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/ClawDeskApp.tsx)
  - 标记整个 route tree 为 deprecated fallback shell，不再作为主要产品方向
- 新增 [docs/PROJECT_SCOPE_MINI.md](/Users/chaosmac/Desktop/open-typeless/docs/PROJECT_SCOPE_MINI.md)
  - 固化新的产品范围、优先级和收缩规则

决定与取舍：

- 这轮没有删除任何录音主链路文件，也没有拆 `preload` / `IPC` / `recorderWindow`
- 旧 ClawDesk UI 仍然可手动打开，避免一次性删掉后影响未知耦合
- `agentWindow` 继续保留，因为当前 `Command / Quick Ask` 仍依赖它，不属于可直接清理的“大 UI”

验证重点：

- 第二阶段改动本质是启动模式和入口降级，后续优先验证：
  - app 启动后是否只驻留菜单栏
  - `Right Ctrl` Dictation 是否还能正常开始 / 停止 / 插字
  - `Right Ctrl + Shift` 和 `Right Ctrl + Space` 是否仍能打开轻量浮窗链路
  - tray 菜单能否手动打开 `Legacy ClawDesk`

给下一个 agent 的具体下一步：

1. 第三阶段先做 Mini menubar 菜单能力，而不是继续修 Legacy UI 视觉。
2. 新增极简 `Mini Settings` 页面时，优先复用现有设置存储，不要重建配置系统。
3. 在 packaged app 下重点复测：
   - `recorderWindow`
   - `preload`
   - `index.html`
   - `floating.html`
   - `IPC_CHANNELS.ASR.*`

## 2026-04-25 第三阶段：OpenTypeless Mini 最小入口

用户诉求：

- 建立 `OpenTypeless Mini` 的最小可用入口。
- app 启动后保持菜单栏优先，不自动打开旧 ClawDesk。
- tray 菜单提供：
  - `Open Mini Settings`
  - `Test Dictation`
  - `Test Command Mode`
  - `Show Logs`
  - `Open Legacy ClawDesk`
  - `Quit`
- 新增极简 `Mini Settings`，只显示：
  - OpenClaw Gateway URL
  - ASR Provider 状态
  - Refinement Provider 状态
  - Hotkey 状态
  - Recorder 状态
- 不做新的 ClawDesk 页面、大设计系统、Chat Workspace、Sidebar 或 Agent Workspace 重构。

本轮改动：

- 修改 [src/main.ts](/Users/chaosmac/Desktop/open-typeless/src/main.ts)
  - tray 菜单改为 Mini 菜单入口
  - 新增 `Test Dictation` / `Test Command Mode` 菜单动作，走 `VoiceModeManager` 现有录音链路
  - 新增 `Show Logs`
  - `Open Legacy ClawDesk` 只通过菜单手动打开
  - 移除 Legacy ClawDesk 的 `Cmd+Shift+Space` 全局唤起注册，避免 Mini 模式下仍有大 UI 快捷入口
  - 新增 Mini status IPC，报告 gateway、ASR、refinement、hotkey、recorder 状态
- 新增 [src/main/windows/mini-settings.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/mini-settings.ts)
  - 独立 `Mini Settings` 小窗口
  - 使用共享 preload
- 新增 Mini renderer：
  - [mini-settings.html](/Users/chaosmac/Desktop/open-typeless/mini-settings.html)
  - [src/renderer/mini-settings/index.ts](/Users/chaosmac/Desktop/open-typeless/src/renderer/mini-settings/index.ts)
  - [src/renderer/mini-settings/styles.css](/Users/chaosmac/Desktop/open-typeless/src/renderer/mini-settings/styles.css)
  - [vite.mini-settings.config.ts](/Users/chaosmac/Desktop/open-typeless/vite.mini-settings.config.ts)
- 修改 [forge.config.ts](/Users/chaosmac/Desktop/open-typeless/forge.config.ts)
  - 增加 `mini_settings_window` renderer target
- 修改 [src/preload.ts](/Users/chaosmac/Desktop/open-typeless/src/preload.ts)、[src/types/global.d.ts](/Users/chaosmac/Desktop/open-typeless/src/types/global.d.ts)、[src/shared/constants/channels.ts](/Users/chaosmac/Desktop/open-typeless/src/shared/constants/channels.ts)
  - 增加 `window.api.mini.getStatus()` 和 `window.api.mini.showLogs()`
- 新增 [src/shared/types/mini.ts](/Users/chaosmac/Desktop/open-typeless/src/shared/types/mini.ts)
  - Mini Settings 状态类型
- 修改 [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts)
  - 增加 `testDictationToggle()` / `testCommandModeToggle()` / `isReady`
  - 用于 tray 测试入口，不绕开现有录音状态机

决定与取舍：

- `Right Ctrl`、`Right Ctrl + Shift`、`Right Ctrl + Space` 主热键逻辑没有重写。
- `recorderWindow`、ASR service、audio chunk IPC、preload、renderer recorder 代码没有被删或重构。
- `Mini Settings` 没有使用 ClawDesk Sidebar / Chat Workspace / 设计系统组件，保持独立小窗。
- 旧 ClawDesk 仍保留，但只能从菜单手动打开。

验证：

- `pnpm -s typecheck` 通过
- 针对本轮变更文件的 `pnpm exec eslint ...` 通过
- `npm run package` 通过
- packaged app 检查通过，`app.asar` 内确认存在：
  - `/.vite/build/main.js`
  - `/.vite/build/preload.js`
  - `/.vite/renderer/main_window/index.html`
  - `/.vite/renderer/floating_window/floating.html`
  - `/.vite/renderer/mini_settings_window/mini-settings.html`
  - `/.vite/renderer/clawdesk_window/clawdesk.html`
- packaged app 原生模块检查通过：
  - `uiohook-napi`
  - `@xitanggg/node-insert-text-darwin-*`
- 全量 `npm run lint` 仍失败在既有配置问题：
  - `vitest.config.ts:1:30 import/no-unresolved Unable to resolve path to module 'vitest/config'`
  - 该失败不在本轮修改文件内

后续建议：

1. 手动打开 packaged app，确认只出现菜单栏图标，不自动打开 ClawDesk。
2. 从 tray 打开 `Open Mini Settings`，确认五项状态能显示并刷新。
3. 从 tray 测 `Test Dictation` / `Test Command Mode`，再用真实 `Right Ctrl` 热键回归。
4. 下一步如果继续做 Mini Settings，可在现有 `mini` IPC 上增加 Gateway URL 编辑，不要复用 ClawDesk 大 Settings 页面。

## 2026-04-26 Step 1: agent 提速与 skills 引导

用户诉求：

- OpenClaw 对简单问题响应慢
- 想做 Web Access + Lark CLI 链式调用（例如”把网页内容加到飞书多维表格”）

本轮改动 — [src/main/services/agent/agent.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/agent/agent.service.ts)：

- spawn args 增加 `--thinking minimal`：避免每次都让默认 reasoning 模型 (zhipu/glm-5.1) 走深度思考链路；简单问题直接答
- spawn args 增加 `--session-id <stable id>`：同一应用进程内复用 session，避免每次冷启动 agent 上下文
- buildPrompt 显式列出已就绪 skills：`web-access / agent-browser / lark-base / feishu-bitable / lark-doc / feishu-create-doc / feishu-fetch-doc / lark-im / lark-task / lark-sheets`
- prompt 中加入链式调用示例（网页→多维表格 / 文章→IM / 创建文档）

经 `openclaw agent --help` 确认 `--thinking minimal` 与 `--session-id` 均为合法 flag。

验证：

- `pnpm exec eslint src/main/services/agent/agent.service.ts` 通过
- `pnpm -s typecheck` 通过

仍待真实场景验证：

- Command / Quick Ask 模式下首字延迟是否明显下降
- 用户口述”把这个链接加到飞书多维表格”时是否真的链式触发 web-access + feishu-bitable

下一步（用户已同意按计划逐步推进）：

- Step 2：Intent Router (T0/T1/T2)，把简单问答从 agent 链路分流到 Ark 轻量模型直答
- Step 3：端到端验证”网页内容→Lark”
- Step 4：清理 Trellis stale 任务

## 2026-04-26 Step 2: Intent Router 上线（T1/T2 分流）

用户诉求：
- OpenClaw 处理简单问题太慢；快速可答 / 涉及外部工具的请求需要走不同链路
- 不动语音热键、ASR、录音链路，只在 agent 调用层做分流

本轮改动：

- 新增 [src/main/services/agent/intent-router.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/agent/intent-router.service.ts)
  - 客户端启发式分类器，零延迟
  - `TOOL_TRIGGERS`：URL、网页关键词、飞书关键词、浏览/发送/创建/读取/执行/搜索 → 强制走 t2（OpenClaw）
  - `T1_SIGNALS`：疑问词、`?`、解释/翻译/改写/总结 → 走 t1（Ark 直答）
  - 长 prompt（>240 字）默认走 t2；短无工具 prompt（≤80 字）默认走 t1；其余 fallback 到 t2
  - 输出 `{ tier, reason }`，主进程日志可见

- 修改 [src/main/services/agent/agent.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/agent/agent.service.ts)
  - `execute()` 入口：先调用 `intentRouter.classify()` + `logIntentDecision()`
  - t1 + Ark 已配置 → 调用新增的 `runQuickAnswer()` 走 Ark `chat/completions`
  - 新增 `runQuickAnswer(runVersion, instruction)`：
    - system prompt 限定 4 句 / 80 字以内、纯中文、不要客套
    - 模型如果判断需要工具，必须只返回 `NEED_AGENT`，主进程拿到后回退到 t2
    - 成功时复用现有 `emitVisibleText()` 流式输出 + `memoryService.appendAction()` 写记忆 + `done` 事件
    - 失败 / 超时 / 空结果 → 返回 false，自动 fallback 到 OpenClaw 主链路
  - t2 路径完全保留 Step 1 的 `--thinking minimal` + `--session-id` + skills prompt

关键取舍：
- T1 / T2 共用同一个 `agent:stream-chunk` 事件流，Quick Ask / Command 顶层完全无感
- Ark 的 system prompt 内置“需要外部工具就返回 NEED_AGENT”逃生口，避免 router 启发式漏判时硬答
- 启发式 + 模型双层判断，不引入额外的 router-only 模型调用，整体仍是单次 LLM 请求

验证：
- `pnpm exec eslint src/main/services/agent/agent.service.ts src/main/services/agent/intent-router.service.ts` 通过
- `pnpm -s typecheck` 通过

仍待真实场景验证：
- 简单问句（“什么是 RAG?” / “解释一下 OAuth” / “翻译这句”）是否真的 < 2s 出字
- “帮我把这个链接加到飞书多维表格”是否仍走 t2 触发 web-access + feishu-bitable
- 边界 case：模糊指令（“查一下…”）路由是否合理

下一步：
- Step 3：拿真实“网页 → 飞书”链路端到端 smoke test
- Step 4：清理 Trellis 4 个 planning 任务的元数据

## 2026-04-26 Step 3+4: 端到端 smoke test + Trellis 清理

Step 3 — 端到端 smoke test 结果：

T1 路径（Ark 直答）：
- 配置确认：`ARK_API_KEY` + `DICTATION_REFINEMENT_ENDPOINT_ID` 已设置
- 简单问答 "什么是 RAG？" → 2.3s 出字（含 curl 网络开销）
- 翻译 "The quick brown fox..." → 直接返回中文翻译
- 工具任务 "帮我把网页存到桌面" → 模型正确返回 `NEED_AGENT`，触发 fallback 到 T2

启发式 router 准确度：
- 12/12 测试用例全部命中预期 tier
- 覆盖：URL、网页关键词、飞书、IM、文档创建、shell、搜索、疑问词、解释、翻译、短问答

T2 路径（OpenClaw plan-only 测试）：
- prompt: "我想把 https://example.com 写到飞书多维表格，不要执行，只列调用 skills"
- OpenClaw 正确选出链：`agent-browser` → `lark-base`（创建 / 写入 / 回读）
- 总耗时 28s（agent 内部 10s）
- skills 识别正确，链式 plan 合理

观察：
- OpenClaw 倾向选 `agent-browser` 而不是 `web-access`，对公开页面来说前者偏重
- 后续可在 prompt 里加一句"无登录态的公开页优先用 web-access"
- stderr 里的 plugin 版本警告（`bluebubbles / discord / feishu / ...` 需 OpenClaw >=2026.4.10，当前 2026.4.2）是 OpenClaw 自身问题，不影响主链路

Step 4 — Trellis 清理：
- 5 个任务全部从 `planning` 改为 `completed`：
  - `01-29-open-typeless-mvp`
  - `01-29-asr-audio-recorder`
  - `01-29-asr-floating-window`
  - `01-29-asr-integration`
  - `01-29-asr-volcengine-client`
- 全部加上 `completedAt: 2026-04-26` 和清理原因 note
- 这些任务的代码早已 ship 到 main；卡在 planning 是因为原作者 `taosu` 的 worktree 路径不在当前机器上，Trellis 流程没走完 phase 4

仍待用户实测：
- 真实热键触发下，简单问句首字延迟是否真有改善
- 对真实飞书数据做"网页→多维表格"完整执行（不只是 plan）

下一步可选方向：
1. 真实跑一次"网页→飞书"端到端写入（需要用户在 ClawDesk 里手动触发，不能在调研脚本里跑）
2. 优化 prompt：明确什么时候用 web-access vs agent-browser
3. Stream 输出能力调研（Step 5）：OpenClaw gateway 是否有 SSE/WS 可以接，避免 final-only

## 2026-04-25 Mini 自动化验证与 Debug 菜单

用户诉求：

- 不再只依赖手动测试，要主动建立并执行自动化验证流程。
- 新增 `scripts/verify-mini-integration.ts`，覆盖静态检查、packaged app 内容检查和半自动 packaged smoke test。
- 在 Mini 菜单栏加入 Debug / Test 菜单项：
  - `Test Recorder Window`
  - `Test IPC`
  - `Test ASR Mock`
  - `Test Text Insert Mock`
  - `Open Logs Folder`
- 测试结果必须写日志，并通过菜单触发时显示 PASS / FAIL notification。

本轮改动：

- 修改 [src/main.ts](/Users/chaosmac/Desktop/open-typeless/src/main.ts)
  - 增加 recorder renderer ready 状态：
    - `recorderWindowReady`
    - `recorderRendererReady`
  - 增加 Mini debug test:
    - `testRecorderWindow()`
    - `testRecorderIpc()`
    - `testAsrMock()`
    - `testTextInsertMock()`
  - 增加 `OPENTYPELESS_SMOKE_TEST=1` packaged smoke mode
    - 自动检查 tray created
    - 自动检查 Legacy ClawDesk hidden
    - 自动检查 recorderWindow loaded
    - 自动检查 recorder preload / renderer ready IPC
    - 自动检查 recorder ping / pong IPC
    - 输出 `MINI_SMOKE_TEST_RESULTS ...` 后退出
  - 菜单中新增 debug/test 项，并将 `Show Logs` 改成 `Open Logs Folder`
- 修改 [src/preload.ts](/Users/chaosmac/Desktop/open-typeless/src/preload.ts)
  - 暴露 Mini debug API：
    - `testRecorderWindow`
    - `testIpc`
    - `testAsrMock`
    - `testTextInsertMock`
    - `signalRecorderReady`
    - `onRecorderPing`
    - `sendRecorderPong`
- 修改 [src/renderer.ts](/Users/chaosmac/Desktop/open-typeless/src/renderer.ts)
  - hidden recorder renderer 启动后主动发送 `recorder:ready`
  - 响应 main process 的 `recorder:ping` 并发送 `recorder:pong`
- 修改 [src/shared/constants/channels.ts](/Users/chaosmac/Desktop/open-typeless/src/shared/constants/channels.ts)、[src/types/global.d.ts](/Users/chaosmac/Desktop/open-typeless/src/types/global.d.ts)
  - 增加 recorder debug IPC 与 mini test IPC 类型
- 新增 [scripts/verify-mini-integration.ts](/Users/chaosmac/Desktop/open-typeless/scripts/verify-mini-integration.ts)
  - 静态检查录音链路文件、IPC 字符串、build 配置、默认启动逻辑
  - 检查 packaged `.app` 的 `app.asar`
  - 检查 `uiohook-napi` 和 `node-insert-text` unpacked native modules
  - 启动 packaged app 执行 `OPENTYPELESS_SMOKE_TEST=1`
- 修改 [package.json](/Users/chaosmac/Desktop/open-typeless/package.json)
  - 新增 `npm run verify:mini`

验证结果：

- `pnpm -s typecheck` 通过
- 针对本轮修改文件的 `pnpm exec eslint ...` 通过
- `npm run package` 通过
- `npm run verify:mini` 通过：
  - `PASS 68/68 checks passed`
  - packaged smoke test PASS：
    - `tray-created`
    - `legacy-clawdesk-hidden`
    - `recorder-window`
    - `recorder-ipc`
- 全量 `npm run lint` 仍失败在既有配置问题：
  - `vitest.config.ts:1:30 import/no-unresolved Unable to resolve path to module 'vitest/config'`

已知边界：

- 自动化现在能证明 recorder window、html、preload、renderer ready IPC、main IPC、packaged resources、ClawDesk 默认隐藏。
- 仍需要真人最小手测：
  - macOS 麦克风权限弹窗 / 授权
  - `Right Ctrl` 真实热键事件是否到达
  - 真实音频是否进入 ASR 服务
  - 文本是否插入当前光标

## 2026-04-27 Overlay 视觉重做 + 4 个交互 bug 修复

用户反馈：
1. Command/Quick Ask 出来的透明黑色 answer overlay 不好看
2. 按 Ctrl+Shift 说完话再按 Ctrl 时，底下小胶囊不消失
3. 小胶囊上的 X 和 ✓ 按钮点不动
4. Agent overlay 一直浮在最前面，切换其他 app 时没有正常退到下层

本轮改动：

- **A. Answer overlay 视觉重做** — [src/renderer/src/styles/components/agent-window.css](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/styles/components/agent-window.css)
  - Spotlight 风格毛玻璃：48px blur、深色渐变、`rgba(255,255,255,0.08)` 边框
  - 顶部 status dot 用 `data-state` 切色（idle/loading/done/error）
  - 底部 footer 改成 `kbd` 风格热键提示
  - 同步 [src/renderer/src/modules/agent/AgentWindow.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/modules/agent/AgentWindow.tsx)
    - 去掉品牌头 / "问题" / "回答" 这类标签文字
    - 接通 status state，让顶部圆点和底部状态文字自动随生命周期切换

- **B. 再按 chord 可停止录音** — [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts)
  - 之前只有 `Right Ctrl` 单键能停止当前模式
  - 现在 `Right Ctrl + Shift` / `Right Alt + Shift` / `Space + Right Ctrl` / `Space + Alt` 四个 chord 在 state ≠ idle 时也走 `stopCurrentMode()`
  - 用户感受：用什么键开始就能用什么键结束，不必专门切换到 `Right Ctrl`

- **C. 胶囊 X / ✓ 按钮可点击** — [src/main/windows/floating.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/floating.ts)
  - 新增 `acceptFirstMouse: true`
  - macOS 下 `focusable: false` 的透明窗默认会吞掉第一次 mousedown，加这个 flag 才能让按钮立刻响应

- **D. Agent overlay 不再 always-on-top** — [src/main/windows/agent.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/agent.ts)
  - `alwaysOnTop: true` → `alwaysOnTop: false`
  - 切到其他 app 时 overlay 会按正常窗口顺序退到下层
  - 同时把窗口尺寸从 920×640 / 680×420 reconcile 成 CSS 实际渲染尺寸 680×420

验证：
- `pnpm -s typecheck` 通过
- 针对本轮变更文件的 `pnpm exec eslint ...` 通过

待用户实测：
- Ctrl+Shift / Ctrl+Space 出来的 overlay 视觉是否符合期望
- 再按 chord 时小胶囊是否立即消失
- 胶囊上的 X / ✓ 按钮是否真的可点击（macOS 偶发首次 mousedown 仍可能被吃掉，若复现再补 listener 层 fallback）
- Agent overlay 是否能被其他 app 自然遮挡

## 2026-04-28 Codex 项目审查

用户要求：

- `review 一下目前项目`

本轮只做代码审查与验证，未修改业务代码。按 Trellis 流程读取：

- `.trellis/workflow.md`
- `.trellis/spec/backend/index.md`
- `.trellis/spec/frontend/index.md`
- `.trellis/spec/guides/cross-layer-thinking-guide.md`
- 当前 `CLAUDE.md`

验证结果：

- `pnpm -s typecheck` 通过
- `pnpm -s test` 通过：2 个测试文件、31 条测试
- `pnpm -s verify:mini` 通过：68/68 checks passed，packaged smoke test 的 tray / legacy hidden / recorder window / recorder IPC 都通过
- `pnpm -s lint` 失败：
  - `vitest.config.ts:1:30 import/no-unresolved Unable to resolve path to module 'vitest/config'`

审查重点发现：

- `AgentService.execute()` 的 T1 quick-answer 并发路径有竞态风险：
  - 当前 quick-answer 没有 subprocess，`abort()` 在 `this.proc === null` 时不会推进 `runVersion` 或清掉 `running`
  - 如果第一轮 quick-answer 还在等 Ark 返回时，第二轮 instruction 进来，旧请求返回后可能把 `running` 改成 false，或在 stale run 上继续 fallback 启动 OpenClaw
  - 下一步应让 quick-answer await 后先检查 `runVersion`，并确保 abort 对无 proc 的 async run 也能失效化
- `AgentWindow` 的 `onStreamChunk` listener 使用了 effect 初次渲染闭包里的 `messages`，`isFirstChunk` 判断会一直基于旧数组，`notifyFirstChunkVisible()` 很可能永远不触发。当前新链路多数地方已经 `forceHide()`，所以影响较轻；但如果 legacy/deferHide 路径恢复，会导致 HUD 不能按首 chunk 解锁隐藏。
- Tray 的 `Test Text Insert Mock` 实际调用 `textInputService.insert('OpenTypeless test')`，会向当前焦点应用真实写入文本。作为调试菜单可接受，但命名里的 Mock 容易误导，后续最好改名或加确认。
- 工作区有大量未提交/未跟踪文件，包括根目录构建产物 `main.js`、`preload.js`、`index-D5sbvxCo.js`、`mini-settings.html`、`docs/`、`out/` 相关内容；后续提交前需要整理 `.gitignore` 与实际提交范围。

给下一位 agent 的具体 next steps：

- 优先修 `AgentService` quick-answer 并发竞态，并补一个单测覆盖“第一轮 quick-answer pending 时第二轮 execute 进来”的场景。
- 修 lint 配置问题，确认 `eslint-plugin-import` 能解析 `vitest/config`，或把 `vitest.config.ts` 排除/配置 resolver。
- 决定调试菜单是否保留 `Test Text Insert Mock`，若保留应改成真实命名或加确认。

## 2026-04-28 Codex 收口治理 + 回归修复

用户要求：

- 对照 Claude 的整体 review，把当前列出的任务尽量全部做掉，之后让 Claude 再分析。

本轮实际改动：

- 仓库卫生：
  - 更新 `.gitignore`，忽略根目录误入的 Vite/Electron 构建产物：
    - `/main.js`
    - `/preload.js`
    - `/index-*.js`
    - `/opentypeless_icon_white_bg.png`
  - 删除本地未跟踪的上述误入文件。
- P1 并发修复：
  - [src/main/services/agent/agent.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/agent/agent.service.ts)
  - `abort()` 现在即使没有 subprocess，也会推进 `runVersion` 并清掉 `running`。
  - T1 quick-answer await 后立即检查 `runVersion`，旧请求不会再覆盖新请求状态，也不会 stale fallback 到 OpenClaw。
- 首 chunk stale closure 修复：
  - [src/renderer/src/modules/agent/AgentWindow.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/modules/agent/AgentWindow.tsx)
  - 使用 `firstChunkNotifiedRef` 判断首 chunk，不再依赖 effect 初次渲染闭包里的 `messages`。
- lint 修复：
  - [.eslintrc.json](/Users/chaosmac/Desktop/open-typeless/.eslintrc.json)
  - 对 `vitest/config` 加 `import/no-unresolved` ignore，`pnpm -s lint` 已恢复通过。
- 调试菜单命名修正：
  - [src/main.ts](/Users/chaosmac/Desktop/open-typeless/src/main.ts)
  - `Test Text Insert Mock` 改为 `Test Text Insert (writes focused app)`，避免误导。
- 麦克风黄点 / recorder 停止信号修复：
  - [src/main/services/asr/asr.service.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/asr/asr.service.ts)
  - 正常 stop 后仍会 emit `status: idle` 给 renderer，让 hidden recorder 停止麦克风流。
  - 但通过 `suppressHudIdle` 保持不向 HUD 发送 idle，避免之前想规避的 visual bounce。
- 死代码清理：
  - 删除 `src/router/classify-intent.ts`
  - 删除 `src/router/schemas.ts`
  - 删除 4 个 legacy push-to-talk stubs：
    - `agent-voice.service.ts`
    - `mode-c.service.ts`
    - `push-to-talk.service.ts`
    - `voice-command.service.ts`
  - 删除无调用方的 topbar / confirm-overlay 代码：
    - `src/main/windows/topbar.ts`
    - `src/main/ipc/topbar.handler.ts`
    - `src/shared/types/topbar.ts`
    - `src/renderer/src/modules/topbar/TopbarWindow.tsx`
    - `src/renderer/src/styles/components/topbar-window.css`
    - `src/main/windows/confirm-overlay.ts`
    - `src/renderer/src/modules/confirm/**`
  - 同步收掉 `preload` / `global.d.ts` / `IPC_CHANNELS` / `windows/index.ts` / `ipc/index.ts` 的相关导出。
- 测试覆盖：
  - 新增 [src/main/services/agent/intent-router.service.test.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/agent/intent-router.service.test.ts)
    - 覆盖 12 个 T1/T2 分流 case。
  - 新增 [src/main/services/agent/agent.service.test.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/agent/agent.service.test.ts)
    - 覆盖 quick-answer pending 时新 run 进来，旧结果不能输出 / 不能污染 running 状态。

重要决定与 tradeoff：

- **没有删除 `src/renderer/clawdesk/**`**：
  - 当前 tray 仍有 `Open Legacy ClawDesk` 入口。
  - `clawDeskMainWindow` 也仍承担 OpenClaw gateway status / workspace fallback。
  - 直接删 renderer 会打断显式 fallback，留给后续产品确认。
- **没有拆 `src/main.ts`**：
  - 当前仍 602 行，超过 CLAUDE.md 的 400 行偏好。
  - 本轮优先做可验证 bug 修复和死代码删除；拆入口文件属于较大结构性重排，建议单独一轮做，避免和清理/提交混在一起。

验证结果：

- `pnpm -s typecheck` 通过
- `pnpm -s lint` 通过
- `pnpm -s test` 通过：4 个测试文件、44 条测试
- `pnpm -s verify:mini` 通过：68/68 checks passed

已知边界 / 下一步：

- 后续如确定不再保留大窗口 fallback，再删除 `src/renderer/clawdesk/**` 和 `clawDeskMainWindow` 相关 IPC。
- 后续单独拆 `src/main.ts`，优先拆出 recorder runtime / mini IPC / tray menu。
- 仍建议真人实测一次：
  - Right Ctrl Dictation 后麦克风黄点是否稳定消失
  - Quick Ask/Command 连续触发时旧回答不会覆盖新回答

## 2026-04-28 Mini UI 调整 + Quick Ask HUD 修复

用户要求：

- 根据当前项目框架，说明还可以做哪些优化和调整。
- 觉得当前 UI 审美不够高级，希望优化 UI 设计和交互方式。
- 修一个小 bug：使用 `Control + Space` 提问后，按完 `Control` 键，底部小胶囊面板没有消失。

本轮实际改动：

- 修 Quick Ask / Command 结束后 HUD 状态残留：
  - [src/main/services/push-to-talk/voice-mode-manager.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.ts)
  - 新增 `resetOverlayAndHide()`，终态先发送 `{ mode: 'idle', phase: 'idle' }` 再 `forceHide()`。
  - 之前只是隐藏 BrowserWindow，但 renderer 内部 `voiceState` 可能还停在 `quickask/executing`，后续状态广播或重显时会把旧胶囊渲出来。
  - [src/main/services/push-to-talk/voice-mode-manager.test.ts](/Users/chaosmac/Desktop/open-typeless/src/main/services/push-to-talk/voice-mode-manager.test.ts) 新增 Command / Quick Ask 的 overlay reset 回归断言。
- Tray menu 降噪：
  - [src/main.ts](/Users/chaosmac/Desktop/open-typeless/src/main.ts)
  - 顶层菜单改为：
    - `OpenTypeless Settings`
    - `Voice` submenu
    - `Diagnostics` submenu
    - `Fix Voice Permissions... / Check Input Monitoring...`
    - `Open ClawDesk Fallback`
  - 调试项从顶层收进 `Diagnostics`，让菜单更像产品入口而不是测试清单。
- Mini Settings 视觉调整：
  - [src/main/windows/mini-settings.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/mini-settings.ts)
  - [src/renderer/mini-settings/index.ts](/Users/chaosmac/Desktop/open-typeless/src/renderer/mini-settings/index.ts)
  - [src/renderer/mini-settings/styles.css](/Users/chaosmac/Desktop/open-typeless/src/renderer/mini-settings/styles.css)
  - 窗口从 `420x470` 调到 `460x520`，避免内容被底部截断。
  - 页面从大标题 Settings 改成更像小型 control center 的结构：
    - 顶部 `OpenTypeless / Control Center`
    - runtime hero
    - 4 个状态行：Gateway / Speech / Refinement / Recorder
    - footer 简化成 `Logs` 和 `Refresh`
  - 色彩从偏米色卡片改为更克制的 warm gray + muted green 状态系统。
- Answer overlay 视觉调整：
  - [src/main/windows/agent.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/agent.ts)
  - [src/renderer/src/styles/components/agent-window.css](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/styles/components/agent-window.css)
  - 尺寸从 `680x420` 调到 `620x360`，减少遮挡。
  - 背景更实、blur 更轻，降低“黑色大遮罩”的感觉。
- Floating HUD 细调：
  - [src/main/windows/floating.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/floating.ts)
  - [src/renderer/src/styles/components/floating-window.css](/Users/chaosmac/Desktop/open-typeless/src/renderer/src/styles/components/floating-window.css)
  - 尺寸从 `196x52` 调到 `184x48`，按钮和波形一起收小，整体更像紧凑语音胶囊。
- 验证脚本同步：
  - [scripts/verify-mini-integration.ts](/Users/chaosmac/Desktop/open-typeless/scripts/verify-mini-integration.ts)
  - 菜单文案检查从 `Open Legacy ClawDesk` 更新为 `Open ClawDesk Fallback`。

验证结果：

- `pnpm -s typecheck` 通过
- `pnpm -s lint` 通过
- `pnpm -s test` 通过：4 个测试文件、46 条测试
- `pnpm -s verify:mini` 通过：68/68 checks passed

已知边界 / 下一步：

- macOS 原生 tray menu 不能做自定义视觉，只能优化文案和分组；如果要真正高级，需要后续做自定义 popover window 替代原生 menu。
- 这轮没有重做 ClawDesk 大窗口；它仍是 fallback/debug surface。
- 后续 UI 优化优先级建议：
  - 自定义 menubar popover（替换 native Menu）
  - Mini Settings 加真实权限修复 CTA 和热键说明
  - Answer overlay 支持 markdown 渲染，而不是 `pre` 纯文本
  - ClawDesk fallback 若继续保留，应降级为 debug console，而不是完整工作台

## 2026-04-28 Sarah 改名复核 + packaged 安装

用户要求：

- Claude Code 已把项目从 OpenTypeless 改名为 `Sarah` / `sarah-desk`。
- 让 Codex 接手后续全部事项：复核改名范围、重新打包安装，并说明 GitHub 迁移前的状态。

本轮实际改动：

- 同步 npm lockfile：
  - [package-lock.json](/Users/chaosmac/Desktop/open-typeless/package-lock.json)
  - 之前 `package.json` 已改为 `sarah-desk`，但 `package-lock.json` 仍是 `open-typeless`；本轮用 `npm install --package-lock-only --ignore-scripts` 修正。
- Sarah Debug Console 可见文案收口：
  - [clawdesk.html](/Users/chaosmac/Desktop/open-typeless/clawdesk.html)
  - [src/main.ts](/Users/chaosmac/Desktop/open-typeless/src/main.ts)
  - [src/main/windows/claw-desk.ts](/Users/chaosmac/Desktop/open-typeless/src/main/windows/claw-desk.ts)
  - [src/renderer/clawdesk/components/layout/Sidebar.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/components/layout/Sidebar.tsx)
  - [src/renderer/clawdesk/pages/Chat.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/pages/Chat.tsx)
  - [src/renderer/clawdesk/pages/Models.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/pages/Models.tsx)
  - [src/renderer/clawdesk/pages/Settings.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/pages/Settings.tsx)
  - [src/renderer/clawdesk/pages/settings/GeneralSection.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/pages/settings/GeneralSection.tsx)
  - [src/renderer/clawdesk/pages/settings/HotkeysSection.tsx](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/pages/settings/HotkeysSection.tsx)
  - [src/renderer/clawdesk/stores/chat.ts](/Users/chaosmac/Desktop/open-typeless/src/renderer/clawdesk/stores/chat.ts)
- 验证脚本同步：
  - [scripts/verify-mini-integration.ts](/Users/chaosmac/Desktop/open-typeless/scripts/verify-mini-integration.ts)
  - 默认启动检查从 `Legacy ClawDesk` 改为 `Sarah Debug Console`。

重要决策 / tradeoff：

- 没有做 `clawdesk` 文件名、IPC channel、类型名的大规模 rename。
  - 原因：这部分现在是 fallback/debug surface，重命名内部 API 会扩大变更面，收益低。
  - 对用户可见的标题、菜单、侧边栏、页面文案已经改为 Sarah / Sarah Debug Console。
- `OpenClaw` 保留不改。
  - 原因：它是底层外部 runtime，不是 Sarah 产品名。
- `CLAUDE.md`、`docs/PROJECT_SCOPE_MINI.md`、`.trellis/`、`AGENTS.md` 中的旧名称多为历史记录或本地路径，没有批量改写。

验证结果：

- `pnpm -s typecheck` 通过
- `pnpm -s lint` 通过
- `pnpm -s test` 通过：4 个测试文件、46 条测试
- `git diff --check` 通过
- `npm run install:app` 通过：
  - out 产物：`/Users/chaosmac/Desktop/open-typeless/out/Sarah-darwin-arm64/Sarah.app`
  - 安装产物：`/Users/chaosmac/Applications/Sarah.app`
  - `Info.plist` 已确认：
    - `CFBundleDisplayName = Sarah`
    - `CFBundleExecutable = Sarah`
    - `CFBundleIdentifier = com.sarah.app`
    - `CFBundleName = Sarah`
- `pnpm -s verify:mini` 通过：68/68 checks passed

已知边界 / 下一步：

- macOS 会把 `com.sarah.app` 视为新 App，用户需要重新授予麦克风、输入监控、辅助功能权限。
- 如果旧 dictionary 有自定义条目，需要从 `~/.config/open-typeless/dictionary.json` 手动迁移到 `~/.config/sarah-desk/dictionary.json`。
- GitHub 迁移建议等 Sarah packaged app 真人主链路确认后再做：
  - 新建空仓库 `sarah-desk`
  - 如需彻底断历史，再 `rm -rf .git && git init`
  - 推送新 initial commit 后再删除旧仓库
