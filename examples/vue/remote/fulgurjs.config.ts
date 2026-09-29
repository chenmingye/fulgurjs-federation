import type { FederationOptions } from '@fulgurjs/federation'

/**
 * 远程端联邦配置（唯一需要维护的联邦声明文件）。
 * exposes：宿主将按这里的键加载模块；改键名时宿主页面表/引用需同步。
 */
export default {
  name: 'vue-remote',
  // 生产构建的容器入口文件名（部署后宿主 prod 地址指向它所在目录）
  filename: 'fulgurjs-remoteEntry.js',
  exposes: {
    './ClickButton': './src/exposes/ClickButton.vue',
    './utils': './src/exposes/utils.ts',
    './pages/HomePage': './src/exposes/pages/HomePage.vue',
    './pages/DetailPage': './src/exposes/pages/DetailPage.vue',
  },
  shared: {
    vue: { singleton: true, requiredVersion: '^3.4.0' },
  },
} satisfies FederationOptions
