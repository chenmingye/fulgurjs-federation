import type { FederationOptions } from '@fulgurjs/federation'

/**
 * 同框架 Vue 宿主联邦配置（demo/same-frame）。
 * 宿主与子应用同框架：shared 只需 vue singleton（纯 Vue 项目零 React 依赖）。
 * 跨框架宿主才需要「vue + react + react-dom 全 singleton」双框架安装合同（README §8.2）。
 */
export default {
  name: 'sf-vue-host',
  remotes: {
    'sf-vue-remote': {
      dev: 'http://localhost:5323',
      prod: '/sf-vue-remote',
    },
  },
  shared: {
    vue: { singleton: true },
  },
} satisfies FederationOptions
