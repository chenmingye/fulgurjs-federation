import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgurjs/federation'

export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'remote-a',
      filename: 'fulgurjs-remoteEntry.js',
      exposes: {
        './Button': './src/exposes/Button.vue',
        './StyledCard': './src/exposes/StyledCard.vue',
        './VueCheck': './src/exposes/VueCheck.vue',
        './utils': './src/exposes/utils.ts',
        './counter': './src/exposes/counter.ts',
      },
      shared: {
        vue: { singleton: true, requiredVersion: '^3.4.0' },
        pinia: { singleton: true },
      },
    }),
  ],
})
