import '@fontsource-variable/geist';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClawDeskApp } from './ClawDeskApp';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('ClawDesk root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ClawDeskApp />
  </React.StrictMode>,
);
