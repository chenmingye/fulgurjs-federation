<template>
  <div class="fed-inner-react">
    <a-card :bordered="false" size="small" class="fed-panel">
      <template #title>联邦演示 · 受控三层嵌套（B → React-C）</template>
      <a-space direction="vertical" :size="6" style="width: 100%">
        <a-alert type="info" show-icon
          :message="`实例身份：jeecg-b（JeecgBoot 子应用实例）· 嵌套深度 ${depth} · 宿主用户 ${userLabel}`" />
        <template v-if="depth >= maxDepth">
          <a-alert type="warning" show-icon
            message="已达受控嵌套深度上限（2 层）"
            description="为避免无限递归与路由环，Jeecg-B 在 depth ≥ 2 时不再挂载下一层联邦应用。当前演示链路：Jeecg-A → Jeecg-B → React-C。" />
        </template>
        <template v-else>
          <a-space wrap>
            <a-tag color="blue">memory 路由 + 宿主 URL 同步（basePath=/fed/inner）</a-tag>
            <a-tag color="green">宿主历史唯一写入方：Jeecg-A</a-tag>
          </a-space>
          <div class="fed-bridge-container" data-fulgurjs="jeecg-b-embeds-react-c">
            <BridgeReactC :app-props="{ depth: depth + 1, host: 'jeecg-b', user: userLabel }"
              :routing="{ basePath: '/fed/inner', navigation: navPort }" />
          </div>
        </template>
        <a-collapse ghost>
          <a-collapse-panel key="diag" header="诊断面板（挂载计数 / 当前链路）">
            <p>React-C 挂载次数：<b>{{ mountCount }}</b>（路由变化不应增长）</p>
            <p>B 当前 memory 路由：<code>{{ route.fullPath }}</code></p>
          </a-collapse-panel>
        </a-collapse>
      </a-space>
    </a-card>
  </div>
</template>

<script setup lang="ts">
/**
 * Jeecg-B 内嵌 React-C（三层链路的中间层宿主）。
 * - C 的导航端口挂在本实例的 memory router 上（useRouter），经 B→A 逐层同步到宿主 URL；
 * - depth 由宿主 appProps 逐层 +1，达到上限渲染提示不再嵌套（防递归/路由环）；
 * - 内层路由切换不重挂：本视图注册了 catch-all 子路由（见 mock/sys/menu.ts）。
 */
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createVueBridgeApp } from '@fulgurjs/federation/bridge/vue'
import { createVueBridgeNavigation } from '@fulgurjs/federation/bridge/router/vue'
import { useBridgeProps } from '/@/fulgurjs/props'

const route = useRoute()
const router = useRouter()
const propsHolder = useBridgeProps()

const depth = computed(() => propsHolder.depth ?? 0)
const userLabel = computed(() => propsHolder.user ?? '（独立启动）')
const maxDepth = 2
const mountCount = ref(0)

// C 的导航端口：读 B 的 memory router（B 自身又接入 A 的宿主端口 → 逐层协调）
const navPort = createVueBridgeNavigation(router)
const BridgeReactC = createVueBridgeApp('react-c/bridge', { retries: 0 })

onMounted(() => { mountCount.value++ })
</script>

<style scoped>
.fed-bridge-container { border: 1px dashed #1890ff; border-radius: 6px; padding: 8px; min-height: 320px; }
</style>
