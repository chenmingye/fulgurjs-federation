import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgur/federation'

export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'remote-b',
      filename: 'unifed-remoteEntry.js',
      exposes: {
        './VueCheck': './src/exposes/VueCheck.vue',
        './LodashPage': './src/exposes/LodashPage.vue',
      },
      shared: {
        // 双版本共存素材：以 vue34 别名提供 vue@3.4.38，共享键为 vue；
        // packageName 让 vue 插件注入的 helper import('vue') 也走共享改写；
        // requiredVersion ~3.4.0 排除 3.5（webpack 语义：消费满足范围的最高版本）
        vue34: {
          import: 'vue34',
          shareKey: 'vue',
          version: '3.4.38',
          packageName: 'vue',
          requiredVersion: '~3.4.0',
          singleton: false,
        },
        // shareKey 重定向素材：导入 lodash-es，复用共享槽 lodash
        'lodash-es': { shareKey: 'lodash', requiredVersion: '^4.17.0' },
      },
    }),
  ],
})
