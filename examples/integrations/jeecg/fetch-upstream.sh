#!/usr/bin/env bash
# JeecgBoot 官方前端基线获取脚本（锁定 tag v3.9.5）
# 用途：在一台新机器上复现 examples/integrations/jeecg 的上游基线；补丁见 examples/integrations/jeecg/patches/
# 说明：examples/integrations/jeecg/app-a、app-b 的完整改造源码已随本仓库交付，正常使用无需本脚本；
#       它只服务于「从上游基线重新生成实例」的可复现路径（examples/integrations/jeecg/README.md §从上游基线生成实例）。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAG="v3.9.5"
COMMIT="e3b9dc0aefe1943d9772b026f64ed671a7c82802"
URL="https://github.com/jeecgboot/JeecgBoot.git"
DEST="$SCRIPT_DIR/upstream/JeecgBoot-${TAG}"

if [ -d "$DEST/jeecgboot-vue3" ]; then
  echo "[fetch] 已存在 $DEST（跳过克隆）"
else
  git clone --depth 1 --branch "$TAG" "$URL" "$DEST"
fi

ACTUAL="$(git -C "$DEST" rev-parse HEAD)"
if [ "$ACTUAL" != "$COMMIT" ]; then
  echo "[fetch] commit 校验失败：期望 $COMMIT，实际 $ACTUAL" >&2
  exit 1
fi
echo "[fetch] JeecgBoot ${TAG} @ ${ACTUAL} 校验通过（MIT，版权见仓库 LICENSE，来源 ${URL}）"

# 安装依赖（pnpm；npmmirror 与官方锁文件的 tarball URL 匹配，避免供应链校验拒绝）。
# 必要配置复制失败立即报错（不再静默吞掉——缺失该文件会改变 pnpm 安装行为）。
cd "$DEST/jeecgboot-vue3"
if [ ! -f ./pnpm-workspace.yaml ]; then
  if [ ! -f "$SCRIPT_DIR/pnpm-workspace.yaml" ]; then
    echo "[fetch] 致命：$SCRIPT_DIR/pnpm-workspace.yaml 不存在，无法配置工作区。" >&2
    exit 1
  fi
  cp "$SCRIPT_DIR/pnpm-workspace.yaml" ./pnpm-workspace.yaml
fi
pnpm install --frozen-lockfile --registry=https://registry.npmmirror.com
echo "[fetch] 完成。生成实例：见 examples/integrations/jeecg/README.md §从上游基线生成实例"
