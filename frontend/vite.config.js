import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const backend = 'http://localhost:5600';

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    outDir: '../public/dist',
    emptyDirOnly: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/auth': backend,
      '/tasks': backend,
      '/chat': backend,
      '/drive': backend,
      '/help': backend,
      '/dashboard': backend,
      '/users': backend,
      '/rewards': backend,
      '/reports': backend,
      '/attendance': backend,
      '/my-attendance': backend,
      '/my-progress': backend,
      '/my-monthly-report': backend,
      '/leaves': backend,
      '/live-status': backend,
      '/notes': backend,
      '/announcements': backend,
      '/backups': backend,
      '/change-password': backend,
      '/uploads': backend,
    },
  },
});
