<template>
  <div data-testid="lodash-page">
    <p>chunk: {{ chunkResult }}</p>
    <p>join: {{ joinResult }}</p>
  </div>
</template>

<script setup lang="ts">
import chunk from 'lodash-es/chunk'
import join from 'lodash-es/join'

const chunkResult = JSON.stringify(chunk([1, 2, 3, 4, 5], 2))
const joinResult = join(['a', 'b', 'c'], '-')
</script>
