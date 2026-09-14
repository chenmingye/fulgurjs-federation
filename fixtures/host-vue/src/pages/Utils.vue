<template>
  <div data-testid="page-utils">
    <p data-testid="utils-sum">sum: {{ sumResult }}</p>
    <p data-testid="utils-greet">{{ greetResult }}</p>
    <p data-testid="utils-answer">{{ answer }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const sumResult = ref('')
const greetResult = ref('')
const answer = ref('')

const utils = await import('remote-a/utils')
sumResult.value = String(utils.sum(1, 2, 3))
greetResult.value = utils.default('host')
answer.value = String(utils.ANSWER)
</script>
