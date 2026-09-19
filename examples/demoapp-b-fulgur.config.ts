/**
 * demo-app-b（同族 jeecg/yudao 三应用）联邦接入配置——跨项目通用性验证样例。
 * 与 demo 同一个后台（localhost:8085/demo，菜单/路由空间一致，27 页表复用）；
 * 应用端口为 demo-app-b 自带 VITE_PORT（admin 8772 / bpm 4527 / lowcode 4664）。
 * 用法：npx fulgur init --config examples/demoapp-b-fulgur.config.ts
 */
import { defineFulgurConfig } from '@fulgur/federation/config'

export default defineFulgurConfig({
  root: '/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/testbed/demo-app-b',
  env: {
    backendOrigin: 'http://localhost:8085',
    backendContext: '/demo',
    qiankun: false,
    compress: 'none',
  },
  deploy: {
    webRoot: '/opt/homebrew/var/www/fulgur-test',
    nginxConf: '/opt/homebrew/etc/nginx/servers/30-fulgur-test-8662.conf',
    listen: 8662,
    backendProxy: 'http://localhost:8085',
  },
  apps: [
    {
      path: 'demo-host',
      name: 'demo-host',
      port: 8772,
      base: '/main',
      host: {
        remotePrefixes: { '/flowable/': 'mes-bpm', '/lowcode/': 'mes-lowcode' },
        remotes: {
          'mes-bpm': { dev: 'http://localhost:4527/flowable', prod: '/flowable' },
          'mes-lowcode': { dev: 'http://localhost:4664/lowcode', prod: '/lowcode' },
        },
        menuFilterPrefixes: ['flowable/', 'lowcode/'],
        pages: [
          { route: '/flowable/bpm/task/todo', name: 'BpmTodoTask', title: '待办任务' },
          { route: '/flowable/bpm/task/done', name: 'BpmDoneTask', title: '已办任务' },
          { route: '/flowable/bpm/task/my', name: 'BpmProcessInstanceMy', title: '我的流程' },
          { route: '/flowable/bpm/task/copy', name: 'BpmProcessInstanceCopy', title: '抄送我的' },
          { route: '/flowable/bpm/task/create', name: 'BpmProcessInstanceCreate', title: '发起流程' },
          { route: '/flowable/bpm/process-instance/detail', name: 'BpmProcessInstanceDetail', title: '流程详情' },
          { route: '/flowable/bpm/manager/action', name: 'BpmModelAction', title: '审批操作' },
          { route: '/flowable/bpm/manager/model', name: 'BpmModel', title: '流程模型' },
          { route: '/flowable/bpm/manager/model/create', name: 'BpmModelCreate', title: '创建流程' },
          { route: '/flowable/bpm/manager/model/:type/:id', name: 'BpmModelUpdate', spec: 'pages/bpm/manager/model/update', title: '修改流程' },
          { route: '/flowable/bpm/manager/form', name: 'BpmForm', title: '流程表单' },
          { route: '/flowable/bpm/manager/form/edit', name: 'BpmFormEditor', title: '表单设计' },
          { route: '/flowable/bpm/manager/category', name: 'BpmCategory', title: '流程分类' },
          { route: '/flowable/bpm/manager/user-group', name: 'BpmUserGroup', title: '用户分组' },
          { route: '/flowable/bpm/manager/process-listener', name: 'BpmProcessListener', title: '流程监听器' },
          { route: '/flowable/bpm/manager/process-expression', name: 'BpmProcessExpression', title: '流程表达式' },
          { route: '/flowable/bpm/manager/process-instance/manager', name: 'BpmProcessInstanceManager', title: '流程实例管理' },
          { route: '/flowable/bpm/manager/process-tasnk', name: 'BpmManagerTask', title: '任务管理' },
          { route: '/flowable/bpm/manager/definition', name: 'BpmProcessDefinition', title: '流程定义' },
          { route: '/flowable/bpm/process-instance/report', name: 'BpmProcessInstanceReport', title: '流程报表' },
          { route: '/lowcode/lowdev/formDesign', name: 'LowcodeFormDesign', title: '表单设计' },
          { route: '/lowcode/lowdev/reportDesign', name: 'LowcodeReportDesign', title: '报表设计' },
          { route: '/lowcode/lowdev/graphReportDesign', name: 'LowcodeGraphReportDesign', title: '图形报表' },
          { route: '/lowcode/lowdev/moduleDesign', name: 'LowcodeModuleDesign', title: '模块设计' },
          { route: '/lowcode/lowdev/reportTest/:code', name: 'ReportTest', title: '报表功能测试' },
          { route: '/lowcode/form/external/:type/:id', name: 'formExternal', title: '外部表单' },
        ],
      },
      remote: {
        boot: 'bpm',
        exposes: {
          './FormRouterPage': './src/views/page/flowable/FormRouterPage.vue',
          './AmisFormRouterPage': './src/components/amis/AmisFormRouterPage.vue',
        },
        detailPatch: false,
      },
      shared: {
        vue: { singleton: true, requiredVersion: '^3.4.0' },
        'vue-router': { singleton: true, requiredVersion: '^4.4.5' },
        pinia: { singleton: true, requiredVersion: '^2.1.7' },
      },
    },
    {
      path: 'demo-bpm',
      name: 'mes-bpm',
      port: 4527,
      base: '/flowable',
      remote: {
        boot: 'bpm',
        remotes: { 'demo-host': { dev: 'http://localhost:8772/main', prod: '/main' } },
        detailPatch: true,
      },
    },
    {
      path: 'demo-lowcode',
      name: 'mes-lowcode',
      port: 4664,
      base: '/lowcode',
      remote: {
        boot: 'lowcode',
        sharedElementPlus: true,
      },
    },
  ],
  demo: {
    adminRoutePath: '/fulgur-demo',
    componentSource: 'src/views/fulgur/FulgurDemo.vue',
    cards: [
      { remote: 'mes-bpm', expose: './TaskCard' },
      { remote: 'mes-lowcode', expose: './InfoCard' },
    ],
  },
})
