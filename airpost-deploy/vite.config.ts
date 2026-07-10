import { defineConfig } from 'vite'

// Relative base so GitHub Pages works for both
// user.github.io/airpost/ and custom domains.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
