<template>
  <div data-testid="page-promise-remote">
    <button data-testid="load-promise" @click="load">load via promise remote</button>
    <div ref="slot" />
  </div>
</template>

<script setup lang="ts">
import { ref, createVNode, render } from 'vue'

const slot = ref<HTMLElement>()
const registered = ref(false)

async function load() {
  // B-14 动态远程：构建时未知，运行时注册（webpack promise remote 的等价能力）
  const rt = (window as any).__FULGUR_RUNTIME__
  if (!registered.value) {
    rt.registerRemote({
      name: 'promise-remote',
      promise: async () => ({
        name: 'promise-remote',
        init: async (map: any) => {
          // 转发到真实 remote-a 容器（模拟"运行时选环境/选版本"）
          const real = await rt.getContainer('remote-a')
          return real.init(map)
        },
        get: async (m: string) => {
          const real = await rt.getContainer('remote-a')
          return real.get(m)
        },
      }),
    })
    registered.value = true
  }
  const mod = await import('promise-remote/Button')
  if (slot.value) render(createVNode(mod.default, { label: 'VIA PROMISE' }), slot.value)
}
</script>
