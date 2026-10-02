import { createApp } from 'vue'
import App from './App.vue'

// 独立运行入口：单独开发/调试 err-good 自身时使用。
// 被宿主消费时走的是 fulgurjs-remoteEntry.js 容器入口，与本文件无关。
createApp(App).mount('#app')
