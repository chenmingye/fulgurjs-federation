import { definePages, remoteSchema, registerRemote } from '@fulgurjs/federation/runtime'
import type { PagesOptions, RemoteConfig, RemoteSchema } from '@fulgurjs/federation/runtime'

const schema: RemoteSchema = remoteSchema
const options: PagesOptions = { schema }
definePages([{ route: '/demo/list', spec: 'demo/List' }], options)

const compatible: RemoteConfig = { name: 'demo', entry: '/remoteEntry.js' }
registerRemote(compatible)
