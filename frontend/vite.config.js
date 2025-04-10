import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  plugins: [react()],
  server: {
    host: "localhost",
    port: process.env.VITE_PORT || 8080,
    strictPort: true,
    hmr: {
      host: "localhost",
      port: process.env.VITE_PORT || 8080,
      protocol: "ws",
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://backend:3000',
        changeOrigin: true,
        secure: false,
      },
    },
    watch: {
      usePolling: true,
      interval: 1000
    },
    allowedHosts: process.env.VITE_ALLOWED_HOSTNAME ? [process.env.VITE_ALLOWED_HOSTNAME] : []
  }
});