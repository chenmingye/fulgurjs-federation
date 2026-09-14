<template>
  <div data-testid="page-error">
    <button data-testid="load-missing" @click="load">load remote-a/NotExist</button>
    <p data-testid="error-box" v-if="errMsg">{{ errMsg }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const errMsg = ref('')

async function load() {
  try {
    await import('remote-a/NotExist')
    errMsg.value = 'NO ERROR (unexpected)'
  } catch (err: any) {
    errMsg.value = `CAUGHT ${err.code ?? 'UNKNOWN'}: ${err.message}`
  }
}
</script>
