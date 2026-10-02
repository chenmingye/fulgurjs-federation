import { createApp } from 'vue'
import App from './App.vue'
import { registerPlugins, registerShare } from '@fulgurjs/federation/runtime'
import demoHooks from './demo/hooksPlugin'
import { provideDemoContext } from './demo/appContextBridge'
import './demo/demo.css'

// ③ 运行时插件：beforeLoadRemote / afterLoadRemote / onRemoteError / resolveShare
//    全部记录到 globalThis.__HOOK_LOG__，卡片③展示
registerPlugins([demoHooks])

// ⑦ 别名共享：把宿主本地模块以 shareKey 'lib-alias' 注册进共享作用域，
//    remote-a 的消费模块经 loadShare('lib-alias') 取到的就是这份
registerShare('default', 'lib-alias', '1.0.0', () => import('./lib/greeting'), { from: 'sh-host' })

// ⑩ AppContext：先 provide 再加载远程页面（时序契约 bridge → 远程 setup → 页面模块）
provideDemoContext()

createApp(App).mount('#app')
