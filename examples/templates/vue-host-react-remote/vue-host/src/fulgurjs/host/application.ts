/** 宿主装配入口：main 只调用 start；在这里连接本工程的路由与远程挂载，原业务页面仍在 pages/。 */
import { createApp } from 'vue'
import { defineApplication } from '@fulgurjs/federation/vue'
import App from '../../App.vue'

export default defineApplication(() => createApp(App))
