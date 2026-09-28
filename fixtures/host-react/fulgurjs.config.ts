import type { FederationOptions } from '@fulgurjs/federation'
import { pages, remotePrefixes } from './src/federation/pages.data'

export default {
  name: 'host-react',
  remotes: {
    'remote-react': {
      dev: 'http://localhost:5103',
      prod: '/remote-react',
    },
  },
  shared: {
    react: { singleton: true },
    'react-dom': { singleton: true },
  },
} satisfies FederationOptions

/** 仅 CLI 读取；同一纯数据模块也供浏览器页面适配器使用 */
export const hostPages = { pages, remotePrefixes }
