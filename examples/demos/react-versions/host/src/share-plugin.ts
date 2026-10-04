/** 真正异步的决策：不导入消费方 React，入口屏障完成后才执行应用。 */
import type { RuntimePlugin } from '@fulgurjs/federation/runtime'
export default {
  name: 'async-version-choice',
  init(hooks) {
    hooks.resolveShare = async ({ shareKey, picked }) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      if (shareKey === 'rv-policy') return {
        version: '1.0.0', from: 'async-policy', eager: false,
        get: async () => ({ label: '异步选择的策略（1.0.0）' }),
      }
      return picked
    }
  },
} satisfies RuntimePlugin
