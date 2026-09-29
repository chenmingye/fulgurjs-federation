import type { FederationOptions } from '@fulgurjs/federation'

/**
 * 远程端联邦配置（唯一需要维护的联邦声明文件）。
 * exposes：宿主将按这里的键加载模块；改键名时宿主页面表/引用需同步。
 */
export default {
  name: 'react-remote',
  filename: 'fulgurjs-remoteEntry.js',
  exposes: {
    './ClickButton': './src/exposes/ClickButton.tsx',
    './utils': './src/exposes/utils.ts',
    './pages/HomePage': './src/exposes/pages/HomePage.tsx',
    './pages/DetailPage': './src/exposes/pages/DetailPage.tsx',
  },
  shared: {
    react: { singleton: true },
    'react-dom': { singleton: true },
  },
} satisfies FederationOptions
