import type { FederationOptions } from '@fulgurjs/federation'

/**
 * 同框架 Vue 宿主联邦配置（examples/demos/same-frame）。
 * 宿主与子应用同框架：shared 只需 vue singleton（纯 Vue 项目零 React 依赖）。
 * 跨框架宿主才需要「vue + react + react-dom 全 singleton」双框架安装合同（README §8.2）。
 * 宿主同时是「远程表单提供方」（./form/ApprovalForm）：子应用经 remoteComponent 反向消费，
 * setup 声明表单依赖的全局注册组件（globalComponents，6.1.0）。
 */
export default {
  name: 'sf-vue-host',
  filename: 'fulgurjs-remoteEntry.js',
  remotes: {
    'sf-vue-remote': {
      dev: 'http://localhost:5323',
      prod: '/sf-vue-remote',
    },
  },
  exposes: {
    './form/ApprovalForm': './src/exposes/form/ApprovalForm.vue',
  },
  setup: './src/fulgurjs/setup.ts',
  shared: {
    vue: { singleton: true },
  },
} satisfies FederationOptions
