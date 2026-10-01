import { createApp, defineComponent, h } from 'vue'
import App from './App.vue'

// 独立运行入口：单独开发/调试子应用自身时使用（渲染同一套页面组件）。
// 被桥接宿主消费时走 fulgurjs-remoteEntry.js 容器入口与 ./bridge 契约，与本文件无关。
const Standalone = defineComponent({
  setup() {
    return () =>
      h('div', { style: 'font-family:sans-serif;padding:16px' }, [
        h('h1', 'bridge-vue-remote（独立运行态）'),
        h(App),
      ])
  },
})
createApp(Standalone).mount('#app')
