<template>
  <div class="ra-card" data-testid="remote-card">
    <h3>{{ title }}</h3>
    <p>Styled by remote-a</p>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ title?: string }>(), { title: 'REMOTE-A CARD' })
</script>

<style scoped>
.ra-card {
  background-color: rgb(250, 240, 137);
  border: 2px solid rgb(34, 34, 34);
  padding: 16px;
  border-radius: 12px;
}
</style>
