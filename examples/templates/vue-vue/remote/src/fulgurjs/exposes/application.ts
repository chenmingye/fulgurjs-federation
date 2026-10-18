/** 应用装配入口：main 只调用 start；独立与嵌入复用本工厂，每次挂载的实例和清理由插件管理。 */
import { createApp } from 'vue'
import { defineApplication } from '@fulgurjs/federation/vue'
import App from '../../App.vue'

// 普通组件远程不需要额外桥接/路由；独立调试仍由同一应用入口启动。
export default defineApplication(() => createApp(App))
