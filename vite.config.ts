import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// BASE_PATH lets the same build be served from a sub-path (e.g. GitHub Pages at /Claude/).
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(here, 'src'),
    },
  },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
