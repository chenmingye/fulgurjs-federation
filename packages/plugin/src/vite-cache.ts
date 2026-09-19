/**
 * DEV-009 自动化：插件版本变化时自动清除本应用的 vite 预构建缓存。
 *
 * 背景：vite 对 node_modules/.vite 下发一年 immutable 缓存，插件 dist 更新后旧的
 * ?f= 门面签名必 404。此前要求「升级插件后手工 rm -rf .vite + 重启」——现在插件在
 * dev server 启动早期（vite 加载 deps 缓存之前）自检版本标记并自清，用户只剩
 * 「重启 dev server」这一个动作。
 */
import fs from 'node:fs'
import path from 'node:path'

export function syncViteCacheMarker(root: string, pluginVersion: string, log: (msg: string) => void): void {
  const viteDir = path.join(root, 'node_modules', '.vite')
  const marker = path.join(viteDir, 'fulgurjs-version.txt')
  try {
    if (fs.existsSync(viteDir)) {
      const prev = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : ''
      if (prev === pluginVersion) return
      fs.rmSync(viteDir, { recursive: true, force: true })
      log(
        `[fulgurjs] 插件版本变化（${prev || '无记录'} → ${pluginVersion}），已自动清除 ${path.relative(root, viteDir)} 预构建缓存` +
          `（避免旧门面签名 404 / DEV-009）。本次启动将重新预构建，首轮 30~60s 属暂态（DEV-010）。`,
      )
    }
    fs.mkdirSync(viteDir, { recursive: true })
    fs.writeFileSync(marker, pluginVersion)
  } catch (e) {
    log(
      `[fulgurjs] 自动清理 .vite 缓存失败（不影响启动；如遇联邦模块 404 请手工执行 rm -rf ${viteDir}）：` +
        `${String((e as Error).message ?? e)}`,
    )
  }
}
