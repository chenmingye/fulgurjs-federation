import { createApp } from 'vue'
import { defineApplication } from '@fulgurjs/federation/vue'
import App from './App.vue'

export default defineApplication(() => createApp(App))
