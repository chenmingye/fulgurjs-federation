/**
 * 隔离、锁定依赖的生产构建。作者：Jason.chen
 * 在全新输出目录内安装和构建，记录输入与产物指纹，不部署、不修改原工作副本。
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
function arg(name, fallback) {
  const index = args.indexOf(name)
  if (index < 0) return fallback
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} 缺少参数`)
  return args[index + 1]
}
const hash = (data) => createHash('sha256').update(data).digest('hex')
function run(command, argv, cwd) {
  const result = spawnSync(command, argv, { cwd, stdio: 'inherit', shell: false })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${argv.join(' ')} 失败，退出码 ${result.status}`)
}

async function main() {
  if (args.includes('--help')) {
    console.log('node tools/reproducible-build.mjs --source <应用目录> --output <不存在的目录> [--pnpm-version <精确版本>] [--script build] [--out-dir dist]')
    return
  }
  const sourceArg = arg('--source')
  const outputArg = arg('--output')
  if (!sourceArg || !outputArg) throw new Error('必须提供 --source 与 --output；原副本不会被构建或安装')
  const source = await fs.realpath(path.resolve(sourceArg))
  const outputPath = path.resolve(outputArg)
  // 使用真实父目录，防止软链接把输出目录绕回原副本。
  const output = path.join(await fs.realpath(path.dirname(outputPath)), path.basename(outputPath))
  const relative = path.relative(source, output)
  if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('输出目录必须位于原副本之外')
  }
  try {
    await fs.lstat(output)
    throw new Error('输出目录已存在：请换一个新目录，脚本不会删除已有文件')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const manifestBytes = await fs.readFile(path.join(source, 'package.json'))
  const manifest = JSON.parse(manifestBytes)
  const lockBytes = await fs.readFile(path.join(source, 'pnpm-lock.yaml'))
  const pinned = /^pnpm@(\d+\.\d+\.\d+)(?:\+.*)?$/.exec(manifest.packageManager ?? '')?.[1]
  const version = arg('--pnpm-version', pinned)
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('请通过 packageManager 或 --pnpm-version 指定精确 pnpm 版本')
  if (pinned && pinned !== version) throw new Error(`pnpm 版本不一致：packageManager=${pinned}，参数=${version}`)
  const script = arg('--script', 'build')
  if (!manifest.scripts?.[script]) throw new Error(`package.json 没有 ${script} 脚本`)
  const outDir = arg('--out-dir', 'dist')
  const artifactRoot = path.resolve(output, 'app', outDir)
  const artifactRelative = path.relative(output, artifactRoot)
  if (path.isAbsolute(outDir) || artifactRelative === '' || artifactRelative === '..' || artifactRelative.startsWith('..' + path.sep) || path.isAbsolute(artifactRelative) || artifactRoot === path.join(output, 'app') || artifactRelative.split(path.sep).includes('node_modules')) {
    throw new Error('--out-dir 必须位于隔离目录内，例如 dist 或 ../dist/lowcode')
  }
  // workspace/link/file 依赖不能凭单应用复制得到相同依赖树，遇到时停止而非悄悄替换。
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, value] of Object.entries(manifest[group] ?? {})) {
      if (/^(workspace:|link:|file:)/.test(value)) throw new Error(`${name} 使用 ${value}；请先准备完整 workspace 的隔离构建方案`)
    }
  }
  const report = {
    source, output, pnpm: version, node: process.version, script, outDir,
    packageSha256: hash(manifestBytes), lockSha256: hash(lockBytes),
    startedAt: new Date().toISOString(), status: 'preparing',
  }
  await fs.mkdir(output)
  const reportPath = path.join(output, 'reproducible-build-report.json')
  const saveReport = () => fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
  try {
    const app = path.join(output, 'app')
    const ignored = new Set(['node_modules', 'dist', '.git', '.svn', '.vite', '.turbo', 'coverage'])
    await fs.cp(source, app, {
      recursive: true,
      filter: async (file) => {
        const rel = path.relative(source, file)
        if (rel.split(path.sep).some((part) => ignored.has(part)) || rel === outDir || rel.startsWith(outDir + path.sep)) return false
        if ((await fs.lstat(file)).isSymbolicLink()) throw new Error(`源文件存在软链接，无法保证隔离：${rel}`)
        return true
      },
    })
    // packageManager 只写入隔离副本；原始输入指纹保留在报告中。
    if (!pinned) {
      manifest.packageManager = `pnpm@${version}`
      await fs.writeFile(path.join(app, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
    }
    report.status = 'installing'
    await saveReport()
    run('corepack', ['pnpm', 'install', '--frozen-lockfile'], app)
    if (hash(await fs.readFile(path.join(app, 'pnpm-lock.yaml'))) !== report.lockSha256) throw new Error('安装后锁文件发生变化，停止构建')
    report.status = 'building'
    await saveReport()
    run('corepack', ['pnpm', 'run', script], app)
    if (hash(await fs.readFile(path.join(app, 'pnpm-lock.yaml'))) !== report.lockSha256) throw new Error('构建脚本修改了锁文件')
    const artifacts = []
    const collect = async (dir) => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name)
        if (entry.isSymbolicLink()) throw new Error(`产物包含软链接：${file}`)
        if (entry.isDirectory()) await collect(file)
        else if (entry.isFile()) {
          const bytes = await fs.readFile(file)
          artifacts.push({ file: path.relative(artifactRoot, file), bytes: bytes.length, sha256: hash(bytes) })
        }
      }
    }
    const realArtifactRoot = await fs.realpath(artifactRoot)
    const realArtifactRelative = path.relative(output, realArtifactRoot)
    if (realArtifactRelative === '..' || realArtifactRelative.startsWith('..' + path.sep) || path.isAbsolute(realArtifactRelative)) throw new Error('产物目录通过软链接指向隔离目录之外')
    await collect(realArtifactRoot)
    if (!artifacts.length) throw new Error('构建没有生成文件，请核对 --out-dir')
    report.status = 'built-not-accepted'
    report.artifacts = artifacts.sort((a, b) => a.file.localeCompare(b.file))
    report.finishedAt = new Date().toISOString()
    await saveReport()
    console.log(`构建产物与指纹：${reportPath}。尚未进行浏览器验收或部署。`)
  } catch (error) {
    report.status = 'failed'
    report.error = error.message
    await saveReport()
    throw error
  }
}

main().catch((error) => {
  console.error(`[reproducible-build] ${error.message}`)
  process.exitCode = 1
})
