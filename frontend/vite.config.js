import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Split heavy third-party libraries into their own cacheable chunks so a
    // page that doesn't use them (e.g. the home page) never downloads them.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // The React runtime + router are needed on the very FIRST paint, so
          // keep them in one long-lived, cacheable chunk.
          if (id.includes('react-router') || id.includes('/react-dom/') || id.includes('/react/')) return 'react-vendor';
          // Everything else (Chart.js, KaTeX, the lucide-react icon set, …) is
          // intentionally NOT pinned to a manual chunk. Feature libs are only
          // imported by lazy routes, so letting Rollup split them naturally means
          // they load WITH the route that needs them instead of on first paint.
          // (Previously a catch-all "vendor" chunk bundled the whole icon set
          // — ~157KB gzip — into the initial download of every page.)
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
})
