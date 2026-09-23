#!/usr/bin/env bash
# fixtures prod 构建 + 产物组装 + 隔离 NGINX 启动。
#
# WP3 隔离改造（2026-09-23）：
# - 产物目录 / nginx conf / pid / 日志全部落在本次运行专属的 mktemp 目录，不写受跟踪文件；
# - 端口默认 8999，被占用时在 8999..9020 内选空闲端口（绝不先杀进程），写入 e2e/.prod-port；
# - 只管理本脚本启动的实例：--stop 读取 e2e/.prod-nginx.json，校验 pid 属于本脚本记录的
#   实例后才停止并清理临时目录；绝不触碰本机其他 NGINX（8661/8662/8999 上的既有实例）。
#
# 用法：
#   bash e2e/scripts/prod-setup.sh           # 构建并启动（返回后实例保持运行）
#   bash e2e/scripts/prod-setup.sh --stop    # 停止本脚本启动的实例并清理
#   FULGURJS_PROD_PORT=9030 bash ...         # 指定端口
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIX="$ROOT/../fixtures"
TEMPLATE="$ROOT/nginx/nginx.conf.template"
STATE_FILE="$ROOT/.prod-nginx.json"
PORT_FILE="$ROOT/.prod-port"

if [ "${1:-}" = "--stop" ]; then
  if [ ! -f "$STATE_FILE" ]; then
    echo "no previous prod instance state (${STATE_FILE} 不存在)，无需停止"
    exit 0
  fi
  PORT="$(python3 -c "import json;print(json.load(open('$STATE_FILE'))['port'])")"
  PID="$(python3 -c "import json;print(json.load(open('$STATE_FILE'))['pid'])")"
  TMP_PROD="$(python3 -c "import json;print(json.load(open('$STATE_FILE'))['tmpDir'])")"
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    # 只停 pid 与记录一致的实例；nginx master 退出后 worker 一并回收
    ps -p "$PID" -o comm= | grep -q nginx && kill "$PID" && echo "stopped nginx pid=$PID (port $PORT)"
  else
    echo "recorded pid=$PID not alive; nothing to stop"
  fi
  rm -rf "$TMP_PROD"
  rm -f "$STATE_FILE" "$PORT_FILE"
  echo "prod instance cleaned"
  exit 0
fi

command -v nginx >/dev/null || { echo "ERROR: nginx not found in PATH" >&2; exit 1; }

# 1. 构建全部 fixtures（remote 子路径 base；host-auto 部署在 /host-auto/ 子路径）
build_fix() {
  local dir="$1"; local base="${2:-}"
  echo "== build $(basename "$dir") =="
  (cd "$dir" && pnpm exec vite build ${base:+--base=$base} 2>&1 | tail -3)
}
build_fix "$FIX/remote-a" '/remote-a/'
build_fix "$FIX/remote-b" '/remote-b/'
build_fix "$FIX/remote-auto" '/remote-auto/'
build_fix "$FIX/host-vue"
build_fix "$FIX/host-auto" '/host-auto/'

# 2. 组装部署目录（本次运行专属临时目录）
TMP_PROD="$(mktemp -d "${TMPDIR:-/tmp}/fulgurjs-e2e-prod.XXXXXX")"
PROD="$TMP_PROD/prod-dist"
mkdir -p "$PROD"
cp -R "$FIX/host-vue/dist/" "$PROD/"
for app in remote-a remote-b remote-auto; do
  mkdir -p "$PROD/$app"
  cp -R "$FIX/$app/dist/" "$PROD/$app/"
done
mkdir -p "$PROD/host-auto"
cp -R "$FIX/host-auto/dist/" "$PROD/host-auto/"

echo "== 产物清单（remoteEntry / manifest）=="
ls "$PROD/remote-auto/" | grep -E "fulgurjs" || true
ls "$PROD/host-auto/" | grep -E "fulgurjs|index" || true

# 3. 端口选择：默认 8999；被占用时在 8999..9020 找空闲（不杀任何进程）
PORT="${FULGURJS_PROD_PORT:-8999}"
# 用 python3 socket 探测（不依赖 lsof——CI runner 不保证安装）
port_busy() {
  python3 - "$1" <<'PY'
import socket, sys
s = socket.socket()
s.settimeout(0.3)
busy = s.connect_ex(('127.0.0.1', int(sys.argv[1]))) == 0
s.close()
sys.exit(0 if busy else 1)
PY
}
if port_busy "$PORT"; then
  PORT=""
  for p in $(seq 8999 9020); do
    if ! port_busy "$p"; then PORT="$p"; break; fi
  done
  [ -n "$PORT" ] || { echo "ERROR: 端口 8999-9020 均被占用" >&2; exit 1; }
  echo "port 8999 occupied — using $PORT"
fi

# 4. 生成 conf 到临时目录（不写受跟踪的 e2e/nginx/nginx.conf）；mime.types 按平台自适应
MIME=""
for m in /opt/homebrew/etc/nginx/mime.types /etc/nginx/mime.types /usr/local/etc/nginx/mime.types; do
  [ -f "$m" ] && MIME="$m" && break
done
CONF="$TMP_PROD/nginx.conf"
sed -e "s|__PROD_DIST__|$PROD|g" -e "s|__PORT__|$PORT|g" -e "s|__MIME_TYPES__|$MIME|g" \
  "$TEMPLATE" > "$CONF"

# 5. 启动隔离实例（-p 前缀 = 本临时目录：pid/日志相对它落盘）
nginx -t -c "$CONF" -p "$TMP_PROD/"
nginx -c "$CONF" -p "$TMP_PROD/"
sleep 1
NGINX_PID="$(cat "$TMP_PROD/nginx.pid" 2>/dev/null || true)"
[ -n "$NGINX_PID" ] || { echo "ERROR: nginx pid 未生成（$TMP_PROD/nginx.pid）" >&2; exit 1; }
python3 - "$STATE_FILE" "$PORT" "$NGINX_PID" "$TMP_PROD" <<'PY'
import json, sys
json.dump({"port": int(sys.argv[2]), "pid": int(sys.argv[3]), "tmpDir": sys.argv[4]}, open(sys.argv[1], "w"))
PY
echo "$PORT" > "$PORT_FILE"

for u in "/" "/remote-a/fulgurjs-remoteEntry.js" "/remote-a/fulgurjs-manifest.json" \
         "/remote-b/fulgurjs-remoteEntry.js" "/remote-auto/fulgurjs-manifest.json" "/host-auto/"; do
  code=$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' "http://localhost:$PORT$u" || echo 000)
  echo "nginx $u -> $code"
done
echo "PROD ENV READY: http://localhost:${PORT} （停止：bash e2e/scripts/prod-setup.sh --stop）"
