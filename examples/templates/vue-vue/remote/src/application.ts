import { createApp } from 'vue'
import { defineApplication } from '@fulgurjs/federation/vue'
import App from './App.vue'

// 普通组件远程不需要额外桥接/路由；独立调试仍由同一应用入口启动。
export default defineApplication(() => createApp(App))
