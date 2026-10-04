import type { FederationOptions } from '@fulgurjs/federation'

/**
 * 同框架 React 宿主联邦配置（examples/demos/same-frame）。
 * 宿主与子应用同框架：shared 只需 react + react-dom singleton（纯 React 项目零 Vue 依赖）。
 * 跨框架宿主才需要「vue + react + react-dom 全 singleton」双框架安装合同（README §8.2）。
 */
export default {
  name: 'sf-react-host',
  remotes: {
    'sf-react-remote': {
      dev: 'http://localhost:5325',
      prod: '/sf-react-remote',
    },
  },
  shared: {
    react: { singleton: true },
    'react-dom': { singleton: true },
  },
} satisfies FederationOptions
