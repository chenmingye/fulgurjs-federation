#!/usr/bin/env bash
# 每个 fixture 都是独立 pnpm workspace；覆盖 Playwright 和生产构建的全部入口。
set -euo pipefail
cd "$(dirname "$0")/../.."
if [ -n "${VITE_VERSION:-}" ]; then
  case "$VITE_VERSION" in
    5.*) vue_plugin=5.0.5; react_plugin=4.2.1 ;;
    6.*) vue_plugin=5.2.4; react_plugin=4.7.0 ;;
    7.*) vue_plugin=6.0.9; react_plugin=5.2.0 ;;
    8.*) vue_plugin=6.0.9; react_plugin=6.1.1 ;;
    *) echo "Unsupported Vite CI profile: $VITE_VERSION" >&2; exit 1 ;;
  esac
fi
for app in host-vue remote-a remote-b remote-auto host-auto remote-react host-react host-bridge-vue host-bridge-react; do
  dir="fixtures/$app"
  if [ -n "${VITE_VERSION:-}" ]; then
    # 一次安装匹配的插件版本，避免先安装与 Vite major 不匹配的依赖树。
    deps=("vite@$VITE_VERSION")
    if node -e 'process.exit(require("./"+process.argv[1]+"/package.json").devDependencies?.["@vitejs/plugin-vue"] ? 0 : 1)' "$dir"; then
      deps+=("@vitejs/plugin-vue@$vue_plugin")
    fi
    if node -e 'process.exit(require("./"+process.argv[1]+"/package.json").devDependencies?.["@vitejs/plugin-react"] ? 0 : 1)' "$dir"; then
      deps+=("@vitejs/plugin-react@$react_plugin")
    fi
    pnpm --dir "$dir" add -D "${deps[@]}"
  else
    pnpm --dir "$dir" install --no-frozen-lockfile
  fi
done
pnpm --dir e2e install --no-frozen-lockfile
