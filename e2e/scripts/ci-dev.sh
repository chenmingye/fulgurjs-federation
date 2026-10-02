#!/usr/bin/env bash
# Linux CI：全部 fixture 显式启动，按本轮进程组清理，日志独立保留供 artifact 下载。
set -euo pipefail
cd "$(dirname "$0")/../.."
LOG_DIR="${FULGURJS_CI_LOG_DIR:-/tmp/fulgurjs-ci-dev}"
mkdir -p "$LOG_DIR"
PIDS=()
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [ "$status" -ne 0 ]; then
    for log in "$LOG_DIR"/*.log; do echo "--- $log ---"; tail -60 "$log"; done
  fi
  for pid in "${PIDS[@]}"; do kill -- "-$pid" 2>/dev/null || true; done
  for pid in "${PIDS[@]}"; do wait "$pid" 2>/dev/null || true; done
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
apps=(remote-a remote-b remote-auto host-auto host-vue remote-react host-react host-bridge-vue host-bridge-react)
ports=(5101 5102 5111 5110 5100 5103 5104 5105 5106)
for i in "${!apps[@]}"; do
  app="${apps[$i]}"
  setsid pnpm --dir "fixtures/$app" exec vite --port "${ports[$i]}" --strictPort >"$LOG_DIR/$app.log" 2>&1 &
  PIDS+=("$!")
done
for i in "${!apps[@]}"; do
  url="http://localhost:${ports[$i]}"
  [[ "${apps[$i]}" == remote-* ]] && url+='/@fulgurjs-manifest.json'
  ready=false
  for attempt in $(seq 1 90); do
    kill -0 "${PIDS[$i]}" 2>/dev/null || { echo "fixture 已退出：${apps[$i]}"; exit 1; }
    if curl -sf --max-time 2 "$url" >/dev/null; then ready=true; break; fi
    sleep 1
  done
  "$ready" || { echo "fixture 未就绪：$url"; exit 1; }
done
# 服务已由此脚本管理，避免 Playwright 再启动并持有后台进程的管道。
SKIP_DEV_SERVERS=1 pnpm --dir e2e exec playwright test \
  --project=dev --project=fault --project=react-dev --project=react-fault \
  --project=bridge-dev --project=bridge-fault --project=bridge-react-dev \
  --project=bridge-router-dev --project=bridge-router-react-dev \
  --global-timeout=600000
