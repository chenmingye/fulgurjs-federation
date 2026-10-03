import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config.ts'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/react-remote/' : undefined,
  // react-router-dom 必须正常进预构建（同 e2e 实测的 fixtures/remote-react：不 exclude、不 alias）：
  // 1) 其传递依赖 cookie 是 CJS-only 包，exclude 后走源码会在浏览器报
  //    "does not provide an export named 'parse'"；
  // 2) 预构建内的 react 导入不会双实例——插件 dev 会向预构建注入 shared 键外部化
  //    resolver（fulgurjs:optimize-shared-external），react 运行时仍协商到 shared singleton 门面。
  plugins: [react(), federation(fulgurjsConfig)],
}))
