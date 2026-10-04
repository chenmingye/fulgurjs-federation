<script setup lang="ts">
/**
 * 身份徽标行：宿主（容器名 + 框架 + 角色）、可选远程（容器名 + 框架 + 角色）、
 * runtime version 徽标（@fulgurjs/federation/runtime 的 version 导出，真实运行时值）。
 */
import { version } from '@fulgurjs/federation/runtime'

defineProps<{
  hostName: string
  framework: string
  remoteName?: string
  remoteFramework?: string
}>()
</script>

<template>
  <p class="sfh-badges">
    <span class="sfh-badge sfh-badge-host">宿主 {{ hostName }} · {{ framework }} · 宿主角色</span>
    <span v-if="remoteName" class="sfh-badge sfh-badge-remote">远程 {{ remoteName }} · {{ remoteFramework }} · 子应用</span>
    <span class="sfh-badge sfh-badge-version" data-testid="runtime-version">@fulgurjs/federation/runtime v{{ version }}</span>
  </p>
</template>
