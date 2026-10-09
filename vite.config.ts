import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        // Dev ship viewer (unlinked from the menu) so preview deploys can
        // show a ship design at /sandbox/ship.html?type=<ship>.
        ship: fileURLToPath(new URL('./sandbox/ship.html', import.meta.url)),
      },
    },
  },
  server: {
    watch: {
      usePolling: true,
      ignored: ['**/node_modules/**', '**/.git/**'],
    },
  },
})
