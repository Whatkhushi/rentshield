import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev: React on :5174, API on :4100. The proxy makes them one origin,
// exactly like production where Express serves the built app.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: { '/api': 'http://localhost:4100' },
  },
});
