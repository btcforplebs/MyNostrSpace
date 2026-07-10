import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split stable, rarely-changing vendors into their own cacheable chunks
        // so first paint (esp. the logged-out Landing page) doesn't ship the
        // whole Nostr stack in one ~780 kB entry bundle.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom', 'react-helmet-async'],
          'nostr-vendor': [
            '@nostr-dev-kit/ndk',
            '@nostr-dev-kit/ndk-cache-dexie',
            'dexie',
            'nostr-tools',
          ],
        },
      },
    },
  },
});
