/**
 * examples/templates/showcase/vue-remote/src/main.ts — 独立运行入口（仅 dev 占位）。
 * 子应用真实能力经 exposes './bridge' 被宿主加载；直开本页仅作 dev server 健康检查。
 */
import { createApp, h } from 'vue'

createApp({
  render: () =>
    h('div', { style: "font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; padding: 24px" }, [
      h('h1', null, 'vue-remote（联邦子应用，默认端口 5335，改端口见 README「改端口」清单）'),
      h('p', null, '本应用通过 expose ./bridge（defineBridgeApp + routing 协议）被宿主加载。'),
      h('p', null, [
        h('a', { href: 'http://localhost:5336/br-vue/orders' }, '打开 React 宿主桥接页（默认 5336）'),
      ]),
    ]),
}).mount('#app')
