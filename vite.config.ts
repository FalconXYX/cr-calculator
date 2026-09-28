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
    /* Three chunks here are big on purpose and none of them is fetched until
       something wants it: the traits, the creatures anyone may have, and the
       sealed ones, which are a megabyte of ciphertext and go only to somebody
       who has typed the password. The default 500 kB warning would fire on
       all three and say nothing useful; this is set just above the largest,
       so a catalogue that grows a great deal still says so. */
    chunkSizeWarningLimit: 1600,
  },
});
