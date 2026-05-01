/**
 * Global type declarations for the Electron application.
 * Extends the Window interface with the exposed API.
 *
 * The API shape types are defined in shared/types/ipc-api.ts and re-exported
 * here so that renderer code gets `window.api` typed correctly.
 */

import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import type { AppApi } from '../shared/types/ipc-api';

declare global {
  interface Window {
    api: AppApi;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        allowpopups?: boolean;
        partition?: string;
        webpreferences?: string;
      };
    }
  }
}

export {};
