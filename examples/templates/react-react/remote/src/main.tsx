import application from './fulgurjs/exposes/application'

// 独立入口只负责启动；初始化写在 application 中。
void application.start('#root').catch(console.error)
