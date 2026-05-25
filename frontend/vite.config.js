import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { copyFileSync, readFileSync } from 'fs'
import { resolve } from 'path'

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'))

// https://vite.dev/config/
export default defineConfig({
  base: '/pdf-2-tiff/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
