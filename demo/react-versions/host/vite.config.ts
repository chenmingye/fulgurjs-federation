import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@fulgurjs/federation'

export default defineConfig(({ command }) => ({
  server: { host: '127.0.0.1' },
  base: command === 'build' ? '/rv-host/' : undefined,
  plugins: [react(), federation({
      name: 'rv-host', shareScope: 'default', dts: false, devSharedSelf: true,
      remotes: {
        'rv-remote18': { dev: 'http://localhost:5441', prod: '/rv-remote18', shareScope: 'react18' },
        'rv-remote18-strict': { dev: 'http://localhost:5442', prod: '/rv-remote18-strict' },
        'rv-remote19': { dev: 'http://localhost:5443', prod: '/rv-remote19' },
      },
      runtimePlugins: ['./src/share-plugin.ts'],
      shared: {
        'rv-policy': { import: './src/policy.ts', version: '2.0.0', requiredVersion: false },
        react: { singleton: true, requiredVersion: '^19.0.0', strictVersion: true },
        'react-dom': { singleton: true, requiredVersion: '^19.0.0', strictVersion: true },
      },
  })],
}))
