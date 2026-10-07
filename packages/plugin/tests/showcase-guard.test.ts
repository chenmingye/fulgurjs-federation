// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, isNavigationFailure } from 'vue-router'
import { guardPending, installGuard, resolveGuard } from '../../../examples/templates/showcase/vue-host/src/guard'
it('首次 locked 深链直接恢复；后续导航的取消/放行仍是真实守卫', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/:pathMatch(.*)*', component: { render: () => null } },
  ] })
  installGuard(router)
  await router.push('/br-react/locked?source=测试#section')
  await router.isReady()
  expect(guardPending.value).toBeNull()
  expect(router.currentRoute.value.path).toBe('/br-react/locked')
  await router.push('/home')
  const cancelled = router.push('/br-react/locked?source=cancel')
  await vi.waitFor(() => expect(guardPending.value?.to).toContain('source=cancel'))
  resolveGuard(false)
  expect(isNavigationFailure(await cancelled)).toBe(true)
  expect(router.currentRoute.value.path).toBe('/home')
  const allowed = router.push('/br-react/locked?source=allow')
  await vi.waitFor(() => expect(guardPending.value?.to).toContain('source=allow'))
  resolveGuard(true)
  await allowed
  expect(router.currentRoute.value.query.source).toBe('allow')
  expect(guardPending.value).toBeNull()
})
