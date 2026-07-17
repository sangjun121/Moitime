import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const copyGithubPagesFallback = () => ({
  name: 'copy-github-pages-fallback',
  closeBundle() {
    copyFileSync(resolve(process.cwd(), 'dist/index.html'), resolve(process.cwd(), 'dist/404.html'));
  },
});

export default defineConfig({
  plugins: [react(), copyGithubPagesFallback()],
  base: '/',
});
