<script setup lang="ts">
import { useRouter } from 'vue-router'
import { createVueBridgeApp, createVueBridgeNavigation } from '@fulgurjs/federation/vue'
const Child = createVueBridgeApp('application-vue/bridge')
const navigation = createVueBridgeNavigation(useRouter())
</script>
<template><Child :app-props="{ label: '内嵌 Vue' }" :routing="{ basePath: '/child', navigation }" /></template>
