import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { copyFileSync } from 'fs'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: '/pdf-2-tiff/',
  plugins: [
    react(),
    {
      name: 'copy-web-config',
      closeBundle() {
        copyFileSync(
          resolve(__dirname, '..', 'web.config'),
          resolve(__dirname, 'dist', 'web.config')
        )
      }
    }
  ],
})
