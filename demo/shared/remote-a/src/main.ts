import { createApp } from 'vue'
import App from './App.vue'

// 独立运行入口：单独自检 remote-a 自身时使用。
// 被宿主消费时走 dev 容器入口（/@fulgurjs-entry.js）或构建产物 remoteEntry，与本文件无关。
createApp(App).mount('#app')
