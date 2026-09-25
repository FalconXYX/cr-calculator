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
    /* The Monster Manual catalogue is a chunk of its own on purpose, and it
       is a little over 600 kB of stat blocks. Nothing fetches it until
       someone opens the picker, so the default 500 kB warning only fires on
       the one chunk that is meant to be big. Set just above it, so a
       catalogue that grows a great deal still says so. */
    chunkSizeWarningLimit: 700,
  },
});
