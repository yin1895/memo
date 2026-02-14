import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  // Multi-page: main window + bubble window
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        bubble: resolve(__dirname, 'bubble.html'),
        'memory-card': resolve(__dirname, 'memory-card.html'),
        'memory-panel': resolve(__dirname, 'memory-panel.html'),
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },

  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 55,
        functions: 55,
        statements: 55,
        branches: 45,
      },
      exclude: ['dist/**', 'src-tauri/**'],
    },
  },
}));
