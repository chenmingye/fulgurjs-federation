# Examples, templates and demo portal

All public runnable projects live under `examples/`. The portal starts the same projects that users copy; basic examples are no longer maintained as duplicate source trees.

| Goal | Project |
|---|---|
| Vue components, pages and TS modules | [templates/vue-vue](templates/vue-vue/) |
| React components, pages and TS modules | [templates/react-react](templates/react-react/) |
| Vue host with a React child app | [templates/vue-host-react-remote](templates/vue-host-react-remote/) |
| React host with a Vue child app | [templates/react-host-vue-remote](templates/react-host-vue-remote/) |
| Bidirectional bridge routing | [templates/showcase](templates/showcase/) |
| Sharing, errors, CLI and React version isolation | [demos](demos/) |
| Jeecg integration | [integrations/jeecg](integrations/jeecg/) |

## Run a template

Download the repository ZIP or clone it. From the repository root:

```bash
cd examples/templates/vue-vue
pnpm install --frozen-lockfile
pnpm dev
# http://localhost:5214
```

Copy the whole template directory, including its package.json, workspace definition, lockfile and child applications. Templates install the published package and do not depend on repository source or sibling projects. See the [template guide](templates/README.md) for Node/pnpm requirements and deployment instructions.

## Manage demos

Run these commands from the repository root:

```bash
node examples/scripts/check-catalog.mjs
node examples/portal/server.mjs
node examples/scripts/start-demo.mjs --scenario vue-basic
node examples/scripts/build-demo.mjs --scenario vue-basic
node examples/scripts/stop-demo.mjs --scenario vue-basic
```

Use repeated `--scenario` flags or `--all`. [scenarios.json](scenarios.json) defines project locations, ports, package managers and startup order. Templates use pnpm workspaces; feature demos use npm; Jeecg apps use their documented package manager. Install failures stop startup. Logs and process records are local under `examples/.run/`.

## Directory migration

Vue/React basic examples moved into `examples/templates/`. Bridge examples are the two cross-framework templates. The former `demo/bridge-router` shares its source with `templates/showcase`; other demos moved into `examples/demos/`, Jeecg into `examples/integrations/`, and the portal/scripts into `examples/portal/` and `examples/scripts/`. Plugin APIs and ports are unchanged.

## Examples in the npm package

The npm package includes only the five templates under `examples/templates/`. Download demos, the Jeecg integration and the portal from this GitHub repository.
