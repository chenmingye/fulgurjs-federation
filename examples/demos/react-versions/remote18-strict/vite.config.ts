import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@fulgurjs/federation'

export default defineConfig(({ command }) => ({
  server: { host: '127.0.0.1' },
  base: command === 'build' ? '/rv-remote18-strict/' : undefined,
  plugins: [react(), federation({
      name: 'rv-remote18-strict', shareScope: 'default', dts: false,
      exposes: { './bridge': './src/bridge.tsx' },
      shared: {
        react: { singleton: true, requiredVersion: '^18.0.0', strictVersion: true },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0', strictVersion: true },
      },
  })],
}))
