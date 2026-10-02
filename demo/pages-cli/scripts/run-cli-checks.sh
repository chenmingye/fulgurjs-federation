#!/usr/bin/env bash
# demo/pages-cli CLI 检查脚本：fulgurjs --help / init / explain / check-pages / doctor 真实运行采样，
# 附加 Node 直导入 remoteSchema 的运行时语义断言（README「如实声明：未转换场景为空表」）。
#
# 前置：
#   1) 本目录下 host/ 已 npm install（脚本开头检查 node_modules；remote/ 的 node_modules 仅在第 6 步
#      用到——不存在时该步会明确提示而非中断）。
#   2) 本脚本【不启动】任何 dev server：
#      - 远程 dev server 未启动时，第 4 步预期输出「无法验证」（详见该步注释的退出码语义），
#        第 5 步 doctor 输出「不可达」类 FAIL——这正是部署面体检的诚实结论；
#      - 若你已先起 dev server（remote/ 与 host/ 分别 npm run dev），4/5 步会输出
#        真实探针结果（含 per-origin 的 PASS 采样）。
# 退出码：0 = 全部断言符合预期（信息性 FAIL 不影响，见各步注释）；非 0 = 有断言未达预期。
# set -uo pipefail（不带 -e）：CLI 各步的「预期失败采样」（check-pages 无法验证、doctor FAIL）
# 本身是非零退出——不中断脚本，由各步注释说明语义后 continue；断言失败才 exit 1。
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
HOST_DIR="${DEMO_DIR}/host"
REMOTE_DIR="${DEMO_DIR}/remote"
LOG_FILE="${SCRIPT_DIR}/last-run.log"

exec > >(tee "${LOG_FILE}") 2>&1

step() { printf '\n========== %s ==========\n' "$*"; }

LAST_RC=0
run_cmd() { # 当前目录执行，捕获合并输出并打印；非零退出码不中断（断言由 expect_* 负责）
  printf '\n$ %s\n' "$*"
  local out rc
  out="$("$@" 2>&1)"
  rc=$?
  [ -n "${out}" ] && printf '%s\n' "${out}"
  LAST_RC=${rc}
  return 0
}

run_cmd_in() { # run_cmd_in <dir> <cmd...>
  local dir="$1"
  shift
  printf '\n$ (cd %s && %s)\n' "${dir}" "$*"
  local out rc
  out="$(cd "${dir}" && "$@" 2>&1)"
  rc=$?
  [ -n "${out}" ] && printf '%s\n' "${out}"
  LAST_RC=${rc}
  return 0
}

expect_rc() { # expect_rc <期望值> <说明>
  if [ "${LAST_RC}" -eq "$1" ]; then
    printf '[ok] %s（退出码 %s 符合预期）\n' "$2" "${LAST_RC}"
  else
    printf '[FAIL] %s——退出码 %s，不符合预期 %s\n' "$2" "${LAST_RC}" "$1"
    exit 1
  fi
}

expect_nonzero() { # expect_nonzero <说明>
  if [ "${LAST_RC}" -ne 0 ]; then
    printf '[ok] %s（退出码 %s，非零符合预期）\n' "$1" "${LAST_RC}"
  else
    printf '[FAIL] %s——预期非零退出，实际 0\n' "$1"
    exit 1
  fi
}

# Vite dev server 默认只监听 localhost（macOS 上常为 IPv6 ::1）——先试 IPv4，再试 localhost（含 IPv6 解析）
port_up() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && return 0
  (exec 3<>"/dev/tcp/localhost/$1") 2>/dev/null && return 0
  return 1
}

# ── 0) 前置检查 ──────────────────────────────────────────────────────────────
step "0) 前置检查：host 工程 node_modules（npx fulgurjs 依赖 host 已 npm install）"
if [ ! -x "${HOST_DIR}/node_modules/.bin/fulgurjs" ]; then
  echo "[FAIL] 未找到 ${HOST_DIR}/node_modules/.bin/fulgurjs——请先在 demo/pages-cli/host 下执行 npm install。"
  exit 1
fi
echo "[ok] host 工程依赖就绪：${HOST_DIR}/node_modules"
if port_up 5363; then REMOTE_UP=1; echo "[info] 远程 dev server 正在运行（5363）"; else REMOTE_UP=0; echo "[info] 远程 dev server 未运行（5363）——第 4/5 步按「远程不可达」语义输出"; fi
if port_up 5364; then echo "[info] 宿主 dev server 正在运行（5364）"; else echo "[info] 宿主 dev server 未运行（5364）"; fi

# ── 1) fulgurjs --help ──────────────────────────────────────────────────────
step "1) fulgurjs --help（在 host 工程内，经本地依赖解析 bin）"
run_cmd_in "${HOST_DIR}" npx fulgurjs --help
expect_rc 0 "fulgurjs --help"

# ── 2) fulgurjs init（临时目录）+ 已存在拒绝覆盖 ─────────────────────────────
step "2) fulgurjs init 在临时目录生成单项目起步模板；第二次运行预期退出码 2（拒绝覆盖）"
TMP_DIR="$(mktemp -d)"
echo "[info] 临时目录：${TMP_DIR}"
run_cmd_in "${TMP_DIR}" "${HOST_DIR}/node_modules/.bin/fulgurjs" init
expect_rc 0 "fulgurjs init 生成模板"
echo "--- 生成的 fulgurjs.config.ts 模板内容： ---"
cat "${TMP_DIR}/fulgurjs.config.ts"
echo "--- 模板内容结束 ---"
# 「--force 拒绝路径」演示：已存在且未加 --force → CLI 打印拒绝覆盖并退出码 2
run_cmd_in "${TMP_DIR}" "${HOST_DIR}/node_modules/.bin/fulgurjs" init
expect_rc 2 "fulgurjs init 已存在时拒绝覆盖（--force 才可覆盖）"
run_cmd_in "${TMP_DIR}" "${HOST_DIR}/node_modules/.bin/fulgurjs" init --force
expect_rc 0 "fulgurjs init --force 覆盖已有模板"
rm -rf "${TMP_DIR}"
echo "[info] 临时目录已清理"

# ── 3) fulgurjs explain（人读格式 + --json） ─────────────────────────────────
step "3) cd host && npx fulgurjs explain（角色/remotes/exposes/页面 spec 映射/加载链）"
run_cmd_in "${HOST_DIR}" npx fulgurjs explain
expect_rc 0 "fulgurjs explain（人读格式）"
run_cmd_in "${HOST_DIR}" npx fulgurjs explain --json
expect_rc 0 "fulgurjs explain --json（CI 形态）"

# ── 4) fulgurjs check-pages（宿主页面表 ↔ 远程 manifest） ────────────────────
step "4) cd host && npx fulgurjs check-pages --manifest pc-remote=http://localhost:5363/fulgurjs-manifest.json"
# 退出码语义（与 CLI 源码一致，注释说明后 continue）：
#   - 「无法验证（unverified）」不是确定性错误：不加 --require-verified 时退出码为 0，
#     不阻断 CI（0 条核对显示「无法验证」而非通过）；
#   - 加 --require-verified 后「无法验证」也非零退出（CI 严格模式）——下方 4b 演示该分支；
#   - 只有确定性 error（如 spec 缺失、路由冲突）才以退出码 1 报告。
# 本步 URL 是 prod 形态路径（dev 容器端点是 /pc-remote/@fulgurjs-manifest.json），
# 因此远程 dev server 即使在运行，该 URL 也拿不到 manifest——预期走「无法验证」分支。
run_cmd_in "${HOST_DIR}" npx fulgurjs check-pages --manifest pc-remote=http://localhost:5363/fulgurjs-manifest.json
echo "[info] 4a 退出码：${LAST_RC}（无法验证分支：默认不失败，继续）"

step "4b) 同命令 + --require-verified（「无法验证也非零」的 CI 严格模式采样）"
# 预期退出码 1（unverifiedFailed）——脚本断言非零后 continue，不中断后续步骤。
run_cmd_in "${HOST_DIR}" npx fulgurjs check-pages --manifest pc-remote=http://localhost:5363/fulgurjs-manifest.json --require-verified
expect_nonzero "--require-verified 下「无法验证」按未通过处理"

step "4c) 补充采样：远程已构建 dist 时用本地 prod manifest 真实核对（预期「全部一致」退出码 0）"
# 该步展示 check-pages 的正向能力：--manifest 指向已构建的 fulgurjs-manifest.json（文件路径形态）。
if [ -f "${REMOTE_DIR}/dist/fulgurjs-manifest.json" ]; then
  run_cmd_in "${HOST_DIR}" npx fulgurjs check-pages --manifest "pc-remote=${REMOTE_DIR}/dist/fulgurjs-manifest.json"
  expect_rc 0 "宿主页面表 spec 与远程 dist exposes 全部一致"
else
  echo "[skip] ${REMOTE_DIR}/dist/fulgurjs-manifest.json 不存在——先在 remote/ 下执行 npm run build 再跑本脚本可采样此步。"
fi

# ── 5) fulgurjs doctor --dev ────────────────────────────────────────────────
step "5) cd host && npx fulgurjs doctor --base http://localhost:5364 --apps pc-host,pc-remote --dev"
# 语义注释（说明后 continue，不中断）：
#   doctor --dev 按「单站点根 + 应用路径段」构造探测 URL：<base>/<app>/@fulgurjs-entry.js。
#   本 demo 的宿主/远程是两个独立 dev origin（5364/5363），且 pc-host 是纯宿主（无 exposes，
#   本就没有 dev 容器入口）——因此该命令会对 pc-host（无入口）与 pc-remote（跨 origin）如实报
#   FAIL，退出码 1。doctor 检的是「部署面可达性」，这是它的诚实结论而不是脚本故障。
#   面向单站点部署形态（nginx 聚合 <base>/<app>/）时，同一命令即逐应用 PASS。
run_cmd_in "${HOST_DIR}" npx fulgurjs doctor --base http://localhost:5364 --apps pc-host,pc-remote --dev
echo "[info] 5a 退出码：${LAST_RC}（见上方注释：双 dev origin + 纯宿主形态下 FAIL 属预期）"

step "5b) 补充采样：容器应用的 per-origin 体检 doctor --base http://localhost:5363 --apps pc-remote --dev"
# doctor 即便 --dev 也探测 prod 形态端点（fulgurjs-remoteEntry.js / fulgurjs-manifest.json）：
# Vite dev server 不提供这两个 prod 文件（SPA 回退返回 200 HTML）→ 如实 FAIL；dev 容器入口
# @fulgurjs-entry.js 探测通过（doctor 对 PASS 项不单独打印，只体现在汇总行）。因此远程运行中
# 退出码仍为 1；远程未运行时报「不可达」FAIL 同样退出码 1——两种输出都属 doctor 的诚实语义。
run_cmd_in "${HOST_DIR}" npx fulgurjs doctor --base http://localhost:5363 --apps pc-remote --dev
echo "[info] 5b 退出码：${LAST_RC}（dev server 不提供 prod 形态端点 → FAIL 属预期；@fulgurjs-entry.js 探测通过不打印）"

# ── 6) 附加：Node 直导入 remoteSchema 恒为空对象的语义断言 ─────────────────────
step "6) 附加断言：Node 直接导入 @fulgurjs/federation/runtime → remoteSchema === {}（README 如实声明）"
# remoteSchema 只有经 Vite 插件的具名静态导入转换（dev 探针）才有内容；Node/build 等未转换场景
# 如实返回空表——宿主面板（remoteSchema 面板）展示 dev 填充形态，本步断言未转换形态。
if [ -d "${HOST_DIR}/node_modules/@fulgurjs/federation" ]; then
  run_cmd_in "${HOST_DIR}" node --input-type=module -e "const m = await import('@fulgurjs/federation/runtime'); console.log('remoteSchema =', JSON.stringify(m.remoteSchema)); if (JSON.stringify(m.remoteSchema) !== '{}') { console.error('FAIL: 预期空对象'); process.exit(1); } console.log('[ok] Node 直导入 remoteSchema 为空对象（诚实降级语义成立）');"
  expect_rc 0 "Node 直导入 remoteSchema === {}"
else
  echo "[skip] host 未安装依赖，跳过。"
fi

# ── 汇总 ────────────────────────────────────────────────────────────────────
step "CLI 检查完成"
echo "全部断言通过（脚本退出码 0）。完整输出已 tee 到：${LOG_FILE}"
