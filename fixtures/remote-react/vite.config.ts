import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@fulgurjs/federation'

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'remote-react',
      exposes: {
        './Button': './src/exposes/Button.tsx',
        './HooksProbe': './src/exposes/HooksProbe.tsx',
        './theme-context': './src/exposes/theme-context.ts',
        // 别名指向同一源码：生产构建应合并为同一 chunk，两个别名加载必须拿到同一
        // 模块实例（B 验证：对象严格相等、顶层只执行一次、成功后零 retry 查询参数）
        './theme-context-alias': './src/exposes/theme-context.ts',
        // 静态依赖链：target 与 second 静态 import 独有 leaf（两个消费者使 leaf 独立成
        // chunk），专测「expose 的静态依赖 chunk 失败」的同页恢复边界
        './static-dep-target': './src/exposes/static-dep-target.tsx',
        './static-dep-second': './src/exposes/static-dep-second.ts',
        './slow-payload': './src/exposes/slow-payload.tsx',
        './broken-render': './src/exposes/broken-render.tsx',
        './pages/home': './src/pages/Home.tsx',
        './pages/detail': './src/pages/Detail.tsx',
        './utils': './src/utils.ts',
        './race-a': './src/exposes/race-a.ts',
        './race-b': './src/exposes/race-b.ts',
        // 5.3.0 桥接：React 子应用契约 + 故障注入 expose（BN01/BN02）
        './bridge': './src/bridge.tsx',
        './bridge-broken': './src/bridge-broken.tsx',
        './bridge-mount-fail': './src/bridge-mount-fail.tsx',
      },
      setup: './src/fulgurjs/setup.ts',
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
      },
    }),
  ],
})
