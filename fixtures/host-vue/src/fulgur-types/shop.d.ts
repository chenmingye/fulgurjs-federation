// 自动生成：fulgur-federation dev 类型直连（remote: remote-a）
// 重新生成：重启 host dev server

declare module 'shop/Button' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
  export * from '../../../remote-a/src/exposes/Button.vue'
}

declare module 'shop/StyledCard' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
  export * from '../../../remote-a/src/exposes/StyledCard.vue'
}

declare module 'shop/VueCheck' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
  export * from '../../../remote-a/src/exposes/VueCheck.vue'
}

declare module 'shop/utils' {
  export * from '../../../remote-a/src/exposes/utils.ts'
  export { default } from '../../../remote-a/src/exposes/utils.ts'
}

declare module 'shop/counter' {
  export * from '../../../remote-a/src/exposes/counter.ts'
}
