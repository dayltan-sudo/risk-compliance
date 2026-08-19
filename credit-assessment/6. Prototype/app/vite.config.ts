import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Two build targets share this config:
//  - `vite build` (default, outDir dist/singlefile-off... see package.json)
//  - `vite build --mode singlefile` inlines everything into one index.html
//    (no dev server needed — opens directly via file://).
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'singlefile' ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === 'singlefile' ? 'dist-singlefile' : 'dist',
  },
}))
