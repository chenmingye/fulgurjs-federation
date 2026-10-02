import { createApp } from 'vue'
import App from './App.vue'

// 独立运行入口：单独开发/调试远程自身时使用（dev 地址 http://localhost:5363/pc-remote/）。
// 被宿主消费时走的是插件中间件直出的 /pc-remote/@fulgurjs-entry.js 容器入口，与本文件无关。
createApp(App).mount('#app')
