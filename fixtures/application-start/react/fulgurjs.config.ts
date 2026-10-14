import type { FederationOptions } from '@fulgurjs/federation'
export default {
  name: 'application-react',
  exposes: { './bridge': './src/application.tsx' },
  remotes: { 'application-react': { dev: 'http://localhost:5482/', prod: '/application-react/' } },
  shared: { react: { singleton: true }, 'react-dom': { singleton: true } },
} satisfies FederationOptions
