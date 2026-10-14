import type { FederationOptions } from '@fulgurjs/federation'
export default {
  name: 'application-vue',
  exposes: { './bridge': './src/application.ts' },
  remotes: { 'application-vue': { dev: 'http://localhost:5481/', prod: '/application-vue/' } },
  shared: { vue: { singleton: true }, pinia: { singleton: true } },
} satisfies FederationOptions
