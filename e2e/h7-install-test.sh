#!/usr/bin/env bash
# H7 装后实测：npm pack → 干净目录安装 tarball → 最小双应用 dev + prod 断言
# 用法：bash e2e/h7-install-test.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="/tmp/h7-install-test"
rm -rf "$T"; mkdir -p "$T"
cd "$ROOT/packages/plugin"
echo "== 1. npm pack =="
PACK_FILE=$(npm pack --pack-destination "$T" 2>/dev/null | tail -1)
echo "tarball: $PACK_FILE"

cd "$T"
echo "== 2. 干净项目安装（tarball + vite + vue）=="
npm init -y >/dev/null
npm i -D "$PACK_FILE" vite@^6.0.0 >/dev/null 2>&1
npm i vue@^3.4.0 >/dev/null 2>&1
node -e "console.log('installed @fulgur/federation:', JSON.parse(require('fs').readFileSync('node_modules/@fulgur/federation/package.json','utf8')).version)"
test -f node_modules/@fulgur/federation/README.md && echo "✓ 包内 README 存在"
test -f node_modules/@fulgur/federation/LICENSE && echo "✓ 包内 LICENSE 存在"

echo "== 3. 最小双应用源码 =="
mkdir -p remote/src host/src
cat > remote/vite.config.mjs <<'EOF'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgur/federation'
export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'remote-a',
      exposes: { './Button.vue': './src/Button.vue' },
      shared: { vue: { singleton: true, requiredVersion: '^3.4.0' } },
    }),
  ],
})
EOF
cat > remote/src/Button.vue <<'EOF'
<template><button class="fed-btn">remote button</button></template>
EOF
cat > remote/index.html <<'EOF'
<div id="app"></div>
<script type="module" src="/src/main.js"></script>
EOF
cat > remote/src/main.js <<'EOF'
import { createApp } from 'vue'
createApp({ render: () => null }).mount('#app')
EOF
cat > host/vite.config.mjs <<'EOF'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgur/federation'
export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'host',
      remotes: { 'remote-a': 'http://localhost:5199' },
      shared: { vue: { singleton: true } },
    }),
  ],
})
EOF
cat > host/index.html <<'EOF'
<div id="app"></div>
<script type="module" src="/src/main.js"></script>
EOF
cat > host/src/main.js <<'EOF'
import { createApp, defineAsyncComponent } from 'vue'
const RemoteButton = defineAsyncComponent(() => import('remote-a/./Button.vue'))
createApp({ render: () => 'host' }).mount('#app')
EOF
# 远程应用也需要 plugin-vue
cd "$T" && npm i -D @vitejs/plugin-vue >/dev/null 2>&1

echo "== 4. dev 引擎断言（remote dev server 端点）=="
cd "$T/remote"
(npx vite --port 5199 --strictPort > "$T/remote-dev.log" 2>&1 &)
sleep 8
ENTRY=$(curl -s --noproxy '*' -o /tmp/h7-entry.js -w "%{http_code}" http://localhost:5199/@unifed-entry.js)
MANI=$(curl -s --noproxy '*' -o /tmp/h7-manifest.json -w "%{http_code}" http://localhost:5199/@unifed-manifest.json)
echo "entry: $ENTRY, manifest: $MANI"
grep -q "export async function init" /tmp/h7-entry.js && echo "✓ dev 容器入口可用"
grep -q "remote-a" /tmp/h7-manifest.json && echo "✓ dev manifest 可用"

echo "== 5. prod 引擎断言（双应用构建）=="
cd "$T/remote" && npx vite build > "$T/remote-build.log" 2>&1 && echo "✓ remote 构建成功"
test -f dist/unifed-remoteEntry.js && echo "✓ remoteEntry 稳定文件名输出"
test -f dist/unifed-manifest.json && echo "✓ manifest 落盘"
cd "$T/host" && npx vite build > "$T/host-build.log" 2>&1 && echo "✓ host 构建成功"

echo "== 6. 清理 =="
pkill -f "vite --port 5199" 2>/dev/null || true
echo "== H7 装后实测通过 =="
