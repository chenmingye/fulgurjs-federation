import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@fulgurjs/federation'

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'remote-react',
      exposes: {
        './Button': './src/exposes/Button.tsx',
        './HooksProbe': './src/exposes/HooksProbe.tsx',
        './theme-context': './src/exposes/theme-context.ts',
        './slow-payload': './src/exposes/slow-payload.tsx',
        './broken-render': './src/exposes/broken-render.tsx',
        './pages/home': './src/pages/Home.tsx',
        './pages/detail': './src/pages/Detail.tsx',
        './utils': './src/utils.ts',
      },
      setup: './src/fulgurjs/setup.ts',
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
      },
    }),
  ],
})
