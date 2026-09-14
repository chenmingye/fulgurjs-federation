import { defineStore } from 'pinia'

/** pinia 共享单例素材（shared.pinia singleton） */
export const useCounterStore = defineStore('unifed-counter', {
  state: () => ({ n: 0 }),
  actions: {
    inc() {
      this.n++
    },
  },
})
