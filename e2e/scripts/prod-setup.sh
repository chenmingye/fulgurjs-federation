#!/usr/bin/env bash
# fixtures prod 构建 + 产物目录组装 + 隔离 NGINX 实例启动（端口 8999，不影响用户现有 NGINX）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIX="$ROOT/../fixtures"
PROD="$ROOT/.prod-dist"
NGX="$ROOT/nginx"

# 1. 构建（remote 以 /remote-a、/remote-b 为 base，模拟微前端子路径部署）
echo "== build remote-a =="
(cd "$FIX/remote-a" && pnpm exec vite build --base=/remote-a/ 2>&1 | tail -3)
echo "== build remote-b =="
(cd "$FIX/remote-b" && pnpm exec vite build --base=/remote-b/ 2>&1 | tail -3)
echo "== build host-vue =="
(cd "$FIX/host-vue" && pnpm exec vite build 2>&1 | tail -3)

# 2. 组装部署目录
rm -rf "$PROD"
mkdir -p "$PROD"
cp -R "$FIX/host-vue/dist/" "$PROD/"
mkdir -p "$PROD/remote-a" "$PROD/remote-b"
cp -R "$FIX/remote-a/dist/" "$PROD/remote-a/"
cp -R "$FIX/remote-b/dist/" "$PROD/remote-b/"

echo "== 产物清单（remoteEntry / manifest / init）=="
ls -la "$PROD/remote-a/" | grep -E "unifed" || true
ls -la "$PROD/" | grep -E "unifed" || true

# 3. 隔离 NGINX 实例（8999）
mkdir -p /tmp/unifed-nginx
sed "s|__PROD_DIST__|$PROD|g" "$NGX/nginx.conf.template" > "$NGX/nginx.conf"
if [ -f /tmp/unifed-nginx/nginx.pid ] && kill -0 "$(cat /tmp/unifed-nginx/nginx.pid)" 2>/dev/null; then
  nginx -c "$NGX/nginx.conf" -s stop -p /tmp/unifed-nginx/ 2>/dev/null || true
  sleep 1
fi
nginx -t -c "$NGX/nginx.conf" -p /tmp/unifed-nginx/
nginx -c "$NGX/nginx.conf" -p /tmp/unifed-nginx/
sleep 1
for u in "/" "/remote-a/unifed-remoteEntry.js" "/remote-a/unifed-manifest.json" "/remote-b/unifed-remoteEntry.js"; do
  code=$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' "http://localhost:8999$u")
  echo "nginx $u -> $code"
done
echo "PROD ENV READY: http://localhost:8999"
