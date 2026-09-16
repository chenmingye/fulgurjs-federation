#!/usr/bin/env bash
# H3 零兜底静态检查：扫描 testbed 源码中的联邦失败回退分支
# 用法：bash e2e/h3-audit.sh   （退出码 0 = 通过，1 = 发现兜底残留）
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)/testbed/demo-app"
FAIL=0

echo "== H3 静态检查 =="
# 1. 联邦迁移标记内不得再有 iframe 兜底分支
hits=$(grep -rn 'v-else-if="FormComponentUrl"\|v-else-if="AmisFormComponentUrl"' \
  "$ROOT/demo-bpm/src" "$ROOT/demo-host/src" "$ROOT/demo-lowcode/src" 2>/dev/null || true)
if [ -n "$hits" ]; then echo "✗ 残留 iframe 兜底分支:"; echo "$hits"; FAIL=1; else echo "✓ 无 iframe 兜底分支残留"; fi

# 2. 联邦装载失败不得静默回退（回落/回退 iframe 通道字样）
hits=$(grep -rn '联邦不可用.*回落\|加载失败.*回落\|失败.*回退.*iframe' \
  "$ROOT/demo-bpm/src" "$ROOT/demo-host/src" "$ROOT/demo-lowcode/src" 2>/dev/null || true)
if [ -n "$hits" ]; then echo "✗ 残留回退语义:"; echo "$hits"; FAIL=1; else echo "✓ 无联邦失败回退语义"; fi

# 3. 空 catch（吞异常）在联邦/qiankun 桥接代码中不得出现
hits=$(grep -rn 'catch {}' \
  "$ROOT/demo-bpm/src/fulgur-exposes" "$ROOT/demo-lowcode/src/fulgur-exposes" \
  "$ROOT/demo-host/src/qiankun" 2>/dev/null || true)
if [ -n "$hits" ]; then echo "✗ 联邦桥接代码存在空 catch:"; echo "$hits"; FAIL=1; else echo "✓ 联邦桥接代码无空 catch"; fi

# 4. 联邦 boot 失败不得被 warn 吞掉
hits=$(grep -rn 'federatedBoot 跳过\|失败（忽略）' \
  "$ROOT/demo-bpm/src" "$ROOT/demo-host/src" "$ROOT/demo-lowcode/src" 2>/dev/null || true)
if [ -n "$hits" ]; then echo "✗ boot 失败被吞:"; echo "$hits"; FAIL=1; else echo "✓ boot 失败显式抛错"; fi

echo "== 检查完成 =="
exit $FAIL
