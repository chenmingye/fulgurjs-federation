import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { build } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { federation } from '../src/index'

describe('build manifest CSS for exposed modules', () => {
  it('publishes CSS from a shared static dependency in the expose manifest entry', { timeout: 60_000 }, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-manifest-css-'))
    const outDir = path.join(root, 'dist')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let cssRelocatedToSharedChunk = false
    try {
      fs.mkdirSync(path.join(root, 'src'), { recursive: true })
      fs.writeFileSync(
        path.join(root, 'index.html'),
        '<!doctype html><html><body><script type="module" src="/src/main.ts"></script></body></html>',
      )
      fs.writeFileSync(path.join(root, 'src/main.ts'), "import { stylesLoaded } from './sharedStyles';\nexport const app = stylesLoaded;\n")
      fs.writeFileSync(
        path.join(root, 'src/federatedBoot.ts'),
        "import { stylesLoaded } from './sharedStyles';\nexport const booted = stylesLoaded;\n",
      )
      fs.writeFileSync(path.join(root, 'src/sharedStyles.ts'), "import './global.css';\nexport const stylesLoaded = Symbol('global');\n")
      fs.writeFileSync(path.join(root, 'src/global.css'), '.federated-global { z-index: 5000 !important; }\n')

      await build({
        root,
        configFile: false,
        logLevel: 'warn',
        plugins: [
          {
            name: 'simulate-css-attached-to-static-dependency',
            generateBundle: {
              order: 'post',
              handler(_options, bundle) {
                const exposed = Object.values(bundle).find(
                  (item) => item.type === 'chunk' && item.facadeModuleId?.endsWith('/src/federatedBoot.ts'),
                )
                const shared = Object.values(bundle).find(
                  (item) => item.type === 'chunk' && item.name === 'shared-styles',
                )
                const cssFile = Object.keys(bundle).find((file) => file.endsWith('.css'))
                if (!exposed || exposed.type !== 'chunk' || !shared || shared.type !== 'chunk' || !cssFile) return

                const exposedMeta = (exposed as any).viteMetadata ??= { importedCss: new Set<string>() }
                const sharedMeta = (shared as any).viteMetadata ??= { importedCss: new Set<string>() }
                exposedMeta.importedCss?.delete(cssFile)
                sharedMeta.importedCss ??= new Set<string>()
                sharedMeta.importedCss.add(cssFile)
                cssRelocatedToSharedChunk = true
              },
            },
          },
          federation({
            name: 'remote-css',
            exposes: { './federatedBoot': './src/federatedBoot.ts' },
          }),
        ],
        build: {
          outDir,
          emptyOutDir: true,
          target: 'es2022',
          minify: false,
          rollupOptions: {
            output: {
              manualChunks(id) {
                return id.endsWith('/src/sharedStyles.ts') ? 'shared-styles' : undefined
              },
            },
          },
        },
      })

      const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'fulgurjs-manifest.json'), 'utf8'))
      expect(cssRelocatedToSharedChunk).toBe(true)
      const cssFiles: string[] = manifest.exposes['./federatedBoot'].css
      expect(cssFiles).toHaveLength(1)
      expect(fs.existsSync(path.join(outDir, cssFiles[0]))).toBe(true)
      expect(fs.readFileSync(path.join(outDir, cssFiles[0]), 'utf8')).toMatch(/z-index:\s*5000\s*!important/)
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('vite/preload-helper.js'))
    } finally {
      warnSpy.mockRestore()
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
