import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgurjs/federation'
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/rv-vue-host/' : undefined,
  plugins: [vue(), federation({
    name: 'rv-vue-host', dts: false,
    remotes: { 'rv-remote18-strict': { dev: 'http://localhost:5442', prod: '/rv-remote18-strict' } },
    runtimePlugins: ['./src/share-plugin.ts'],
    shared: {
      vue: { singleton: true, strictVersion: true, requiredVersion: '^3.0.0' },
      react: { singleton: true, strictVersion: true, requiredVersion: '^18.0.0' },
      'react-dom': { singleton: true, strictVersion: true, requiredVersion: '^18.0.0' },
    },
  })],
}))
