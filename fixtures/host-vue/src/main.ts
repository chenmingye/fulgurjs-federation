import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import HomePage from './pages/Home.vue'
import UtilsPage from './pages/Utils.vue'
import MultiPage from './pages/Multi.vue'
import ScopePage from './pages/Scope.vue'
import ErrorPage from './pages/Error.vue'
import RenamePage from './pages/Rename.vue'
import PromiseRemotePage from './pages/PromiseRemote.vue'
import SharedStatePage from './pages/SharedState.vue'

const routes = [
  { path: '/', component: HomePage },
  { path: '/utils', component: UtilsPage },
  { path: '/multi', component: MultiPage },
  { path: '/scope', component: ScopePage },
  { path: '/error', component: ErrorPage },
  { path: '/rename', component: RenamePage },
  { path: '/promise-remote', component: PromiseRemotePage },
  { path: '/shared-state', component: SharedStatePage },
]

const router = createRouter({ history: createWebHashHistory(), routes })
const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
