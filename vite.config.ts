import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The site is served from a subpath, not the domain root, so asset URLs
  // have to be prefixed or every script and stylesheet 404s once deployed.
  base: '/cr-calculator/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
