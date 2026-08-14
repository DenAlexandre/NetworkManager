import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // node_modules/.vite (default) is stuck with a locked/undeletable cache on this
  // machine (Windows ACL blocks unlinking files from an earlier session/account).
  // Using a fresh, never-before-written directory avoids Vite needing to delete
  // anything there.
  cacheDir: 'node_modules/.vite-cache',
})
