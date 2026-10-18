import application from './fulgurjs/exposes/application'
void application.start('#app', { label: '独立 Vue 子应用' }).catch(console.error)
