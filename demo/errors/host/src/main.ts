import { createApp } from 'vue'
import { installErrorMonitor } from './error-monitor'
import App from './App.vue'

// 未预期错误监视器必须先于业务代码安装，才能覆盖页面生命周期的全部错误通道
installErrorMonitor()

createApp(App).mount('#app')
