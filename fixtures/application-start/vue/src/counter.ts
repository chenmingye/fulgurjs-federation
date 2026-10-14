import type { InjectionKey } from 'vue'
import { defineStore } from 'pinia'
export const counterDefinition = defineStore('counter', { state: () => ({ count: 0 }) })
export const counterKey: InjectionKey<typeof counterDefinition> = Symbol('本实例计数器')
