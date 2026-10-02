#!/usr/bin/env bash
# JeecgBoot 官方前端基线获取脚本（锁定 tag v3.9.5）
# 用途：在一台新机器上复现 demo/jeecg 的上游基线；补丁见 demo/jeecg/patches/
set -euo pipefail
TAG="v3.9.5"
COMMIT="e3b9dc0aefe1943d9772b026f64ed671a7c82802"
URL="https://github.com/jeecgboot/JeecgBoot.git"
DEST="$(cd "$(dirname "$0")" && pwd)/upstream/JeecgBoot-${TAG}"

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

# 安装依赖（pnpm；npmmirror 与官方锁文件的 tarball URL 匹配，避免供应链校验拒绝）
cd "$DEST/jeecgboot-vue3"
cp -n "$(dirname "$0")/pnpm-workspace.yaml" ./pnpm-workspace.yaml 2>/dev/null || true
pnpm install --frozen-lockfile --registry=https://registry.npmmirror.com
echo "[fetch] 完成。生成实例：见 demo/jeecg/README.md §从基线生成实例"
