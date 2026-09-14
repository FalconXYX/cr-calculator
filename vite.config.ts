import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative, not '/cr-calculator/'. The site is served from a subpath rather
  // than a domain root, and from a DIFFERENT subpath on the mirror, so one
  // build has to work at any depth. Absolute asset URLs would 404 on either
  // host that is not the one they were baked for.
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
