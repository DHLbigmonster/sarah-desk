/**
 * IPC channel constants.
 * Used by both main process and renderer process for communication.
 */

export const IPC_CHANNELS = {
  ASR: {
    /** Start ASR session */
    START: 'asr:start',
    /** Stop ASR session */
    STOP: 'asr:stop',
    /** Send audio data (Renderer -> Main) */
    SEND_AUDIO: 'asr:send-audio',
    /** ASR result (Main -> Renderer) */
    RESULT: 'asr:result',
    /** Live microphone level for the recorder HUD (Main -> Renderer) */
    LEVEL: 'asr:level',
    /** ASR status change (Main -> Renderer) */
    STATUS: 'asr:status',
    /** ASR notice / non-error user feedback (Main -> Renderer) */
    NOTICE: 'asr:notice',
    /** ASR error (Main -> Renderer) */
    ERROR: 'asr:error',
  },
  FLOATING_WINDOW: {
    /** Show floating window (Renderer -> Main) */
    SHOW: 'floating-window:show',
    /** Hide floating window (Renderer -> Main) */
    HIDE: 'floating-window:hide',
    /** Set content height for adaptive window sizing (Renderer -> Main) */
    SET_CONTENT_HEIGHT: 'floating-window:set-content-height',
    /** Update live audio level from the recorder renderer (Renderer -> Main) */
    SET_AUDIO_LEVEL: 'floating-window:set-audio-level',
  },
  PUSH_TO_TALK: {
    /** Cancel the current recording without inserting text (Renderer -> Main) */
    CANCEL: 'push-to-talk:cancel',
    /** Confirm and stop recording, insert text (Renderer -> Main) */
    CONFIRM: 'push-to-talk:confirm',
    /** Main -> Renderer: current voice mode / phase for HUD visibility */
    STATE: 'push-to-talk:state',
  },
  AGENT: {
    /** Show agent window with context payload (Main -> Renderer) */
    SHOW: 'agent:show',
    /** Hide/close agent window (Renderer -> Main) */
    HIDE: 'agent:hide',
    /** Send user instruction to main process (Renderer -> Main) */
    SEND_INSTRUCTION: 'agent:send-instruction',
    /** Abort current running agent task (Renderer -> Main) */
    ABORT: 'agent:abort',
    /** Streamed text chunk from claude CLI (Main -> Renderer) */
    STREAM_CHUNK: 'agent:stream-chunk',
    /** Agent turn complete (Main -> Renderer) */
    STREAM_DONE: 'agent:stream-done',
    /** Agent error (Main -> Renderer) */
    STREAM_ERROR: 'agent:stream-error',
    /** Start STT for agent voice input (Renderer -> Main) */
    STT_START: 'agent:stt-start',
    /** Stop STT (Renderer -> Main) */
    STT_STOP: 'agent:stt-stop',
    /** STT transcript result (Main -> Renderer) */
    STT_RESULT: 'agent:stt-result',
    /** External voice instruction should appear as a user message and auto-submit */
    EXTERNAL_SUBMIT: 'agent:external-submit',
    /** Save current session messages to disk (Renderer -> Main) */
    SAVE_SESSION: 'agent:save-session',
    /** Load today's persisted session messages (Renderer -> Main, returns PersistedSession|null) */
    GET_TODAY_SESSION: 'agent:get-today-session',
    /** Get all daily summaries (Renderer -> Main, returns DailySummary[]) */
    GET_DAILY_SUMMARIES: 'agent:get-daily-summaries',
    /** Notify renderer that a new daily summary is ready (Main -> Renderer) */
    DAILY_SUMMARY_READY: 'agent:daily-summary-ready',
    /** Display a buffered Command-mode result (transcript + result) without re-executing */
    SHOW_RESULT: 'agent:show-result',
    /** Notify main that answer overlay received first visible chunk (Renderer -> Main) */
    FIRST_CHUNK_VISIBLE: 'agent:first-chunk-visible',
  },
  CLAW_DESK: {
    /** Read the current ClawDesk / OpenClaw connection summary */
    GET_STATUS: 'claw-desk:get-status',
    /** Force a fresh connection probe */
    REFRESH_STATUS: 'claw-desk:refresh-status',
    /** Resolve the full OpenClaw workspace URL for the renderer shell */
    GET_WORKSPACE_TARGET: 'claw-desk:get-workspace-target',
    /** Return the ClawDesk window to the local Home view */
    SHOW_HOME: 'claw-desk:show-home',
    /** Load settings overview payload for the ClawDesk settings page */
    GET_SETTINGS_OVERVIEW: 'claw-desk:get-settings-overview',
    /** Read the current renderer theme preference */
    GET_THEME_MODE: 'claw-desk:get-theme-mode',
    /** Persist the current renderer theme preference */
    SET_THEME_MODE: 'claw-desk:set-theme-mode',
    /** Detect local CLI tool availability and versions */
    DETECT_CLI_TOOLS: 'claw-desk:detect-cli-tools',
    /** Read full detail for a single skill */
    GET_SKILL_DETAIL: 'claw-desk:get-skill-detail',
    /** Save edited skill content */
    SAVE_SKILL_CONTENT: 'claw-desk:save-skill-content',
    /** Open a local path in the default system app */
    OPEN_PATH: 'claw-desk:open-path',
    /** Open an external URL in the default browser */
    OPEN_EXTERNAL: 'claw-desk:open-external',
    /** Get the current hotkey config */
    GET_HOTKEY_CONFIG: 'claw-desk:get-hotkey-config',
    /** Save a new hotkey config and apply it live */
    SAVE_HOTKEY_CONFIG: 'claw-desk:save-hotkey-config',
    /** Check whether a toggle-window accelerator conflicts with system shortcuts */
    CHECK_TOGGLE_WINDOW: 'claw-desk:check-toggle-window',
    /** Check whether a voice trigger key is usable before saving */
    CHECK_VOICE_TRIGGER: 'claw-desk:check-voice-trigger',
    /** Toggle voice input for ClawDesk Chat: start recording or stop and return transcript */
    VOICE_INPUT_TOGGLE: 'claw-desk:voice-input-toggle',
    /** Stop voice input and return transcript (same as toggle when recording) */
    VOICE_INPUT_STOP: 'claw-desk:voice-input-stop',
    /** Get decrypted config keys for a provider (voice or text) */
    CONFIG_GET_PROVIDER_KEYS: 'claw-desk:config-get-provider-keys',
    /** Save a single config key (encrypted) */
    CONFIG_SET_PROVIDER_KEY: 'claw-desk:config-set-provider-key',
    /** Delete a config key (falls back to .env) */
    CONFIG_DELETE_PROVIDER_KEY: 'claw-desk:config-delete-provider-key',
    /** Get Open Claw installation and auth status */
    GET_OPENCLAW_STATUS: 'claw-desk:get-openclaw-status',
    /** Get selectable agent runtimes and current runtime choice */
    GET_AGENT_RUNTIME_SELECTION: 'claw-desk:get-agent-runtime-selection',
    /** Persist selected agent runtime */
    SET_AGENT_RUNTIME: 'claw-desk:set-agent-runtime',
    /** Select a runtime and open/start the next setup step if needed */
    CONNECT_AGENT_RUNTIME: 'claw-desk:connect-agent-runtime',
  },
  LOCAL_TOOLS: {
    /** Detect local tools, auth state, safe capabilities, and setup gaps */
    GET_SNAPSHOT: 'local-tools:get-snapshot',
    /** Grant approval for a capability (Renderer -> Main) */
    SET_APPROVAL: 'local-tools:set-approval',
    /** Revoke approval for a capability (Renderer -> Main) */
    REVOKE_APPROVAL: 'local-tools:revoke-approval',
    /** Execute a capability (Renderer -> Main) */
    EXECUTE: 'local-tools:execute',
  },
  MINI: {
    /** Read current Mini runtime status for the settings window */
    GET_STATUS: 'mini:get-status',
    /** Hide the custom menu bar popover */
    HIDE_POPOVER: 'mini:hide-popover',
    /** Show the full Sarah settings window */
    SHOW_SETTINGS: 'mini:show-settings',
    /** Run permission repair flow */
    OPEN_PERMISSIONS: 'mini:open-permissions',
    /** Toggle Dictation from UI */
    TOGGLE_DICTATION: 'mini:toggle-dictation',
    /** Toggle Command mode from UI */
    TOGGLE_COMMAND: 'mini:toggle-command',
    /** Toggle Quick Ask from UI */
    TOGGLE_QUICK_ASK: 'mini:toggle-quick-ask',
    /** Quit Sarah */
    QUIT: 'mini:quit',
    /** Open the current electron-log output location */
    SHOW_LOGS: 'mini:show-logs',
    /** Mark first-run onboarding complete */
    COMPLETE_ONBOARDING: 'mini:complete-onboarding',
    /** Renderer -> Main: hidden recorder renderer and preload are alive */
    RECORDER_READY: 'recorder:ready',
    /** Main -> Renderer: ping hidden recorder renderer */
    RECORDER_PING: 'recorder:ping',
    /** Renderer -> Main: hidden recorder renderer pong response */
    RECORDER_PONG: 'recorder:pong',
    /** Run packaged/dev recorder window load test */
    TEST_RECORDER_WINDOW: 'mini:test-recorder-window',
    /** Run packaged/dev recorder IPC ping-pong test */
    TEST_IPC: 'mini:test-ipc',
    /** Run fake ASR final-text refinement test without microphone */
    TEST_ASR_MOCK: 'mini:test-asr-mock',
    /** Insert fixed test text into the current app */
    TEST_TEXT_INSERT_MOCK: 'mini:test-text-insert-mock',
  },
} as const;
