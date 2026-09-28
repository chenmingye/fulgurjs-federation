import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'remote-react',
  exposes: {
    './Button': './src/Button.tsx',
    './utils': './src/utils.ts',
    './pages/home': './src/pages/Home.tsx',
    './pages/detail': './src/pages/Detail.tsx',
  },
  // 有初始化需求才添加（应用级 setup 一次 + 会话级 onSession 按宿主 sessionKey 去重）：
  // setup: './src/fulgurjs/setup.ts',
  shared: {
    react: { singleton: true },
    'react-dom': { singleton: true },
  },
} satisfies FederationOptions
