<template>
  <button class="ra-btn" data-testid="remote-btn" @click="count++">
    {{ label }} (clicked {{ count }})
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue'

withDefaults(defineProps<{ label?: string }>(), { label: 'REMOTE-A BUTTON' })
const count = ref(0)
</script>

<style scoped>
.ra-btn {
  color: #ffffff;
  background-color: rgb(22, 119, 255);
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
}
</style>
