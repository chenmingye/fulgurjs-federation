import application from './fulgurjs/exposes/application'
void application.start('#root', { label: '独立 React 子应用' }).catch(console.error)
