/**
 * Floating window entry point.
 *
 * Supports two modes determined by the `mode` query-string parameter:
 *   ?mode=agent  → renders AgentWindow (AI chat panel)
 *   (default)    → renders FloatingWindow (ASR status bar)
 */

import '@fontsource-variable/geist';
import '@fontsource/jetbrains-mono/400.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { FloatingWindow } from '../src/modules/asr';
import { AgentWindow } from '../src/modules/agent';
import '../src/styles/components/floating-window.css';
import '../src/styles/components/agent-window.css';

document.documentElement.style.background = 'transparent';
document.body.style.background = 'transparent';
document.body.style.margin = '0';

// Detect mode from query string
const params = new URLSearchParams(window.location.search);
const mode = params.get('mode');

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found. Make sure there is a div with id="root" in the HTML.');
}

const root = createRoot(rootElement);

if (mode === 'agent') {
  root.render(React.createElement(AgentWindow));
} else {
  root.render(React.createElement(FloatingWindow));
}
