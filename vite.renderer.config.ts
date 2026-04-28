import { defineConfig } from 'vite';

// https://vitejs.dev/config
//
// The main_window renderer is a hidden window whose sole purpose is
// to host the Web Audio API (AudioRecorder) — there is no React UI
// in this renderer, so no plugins are required. We still declare an
// explicit input so Vite builds index.html reliably in production.
export default defineConfig({
  build: {
    rollupOptions: {
      input: 'index.html',
    },
  },
});
