import { createReactHostPages } from '@fulgurjs/federation/react'
import { pages, remotePrefixes } from '../fulgurjs.config.ts'

// 页面适配器：URL 解析、最长前缀远程归属、异步组件缓存、
// 加载/错误占位（含「重试加载 / 刷新页面重试」）全部由插件完成。
// 模块顶层创建一次（不能在组件 render 内调用工厂）。
const hostPages = createReactHostPages({
  pages,
  remotePrefixes,
})

/** 远程首页组件（spec = 远程名 + exposes 键） */
export const RemoteHomePage = hostPages.component('react-remote/pages/HomePage')

/** 远程详情组件：宿主路由层把 params/query 作为 props 传入 */
export const RemoteDetailPage = hostPages.component<{ id?: string; tab?: string }>('react-remote/pages/DetailPage')
