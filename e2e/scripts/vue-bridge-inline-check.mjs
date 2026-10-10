// 验证正式入口的 Vue 模板内联 appProps；不能用显式类型变量代替调用点检查。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const root = path.resolve(process.argv[2] ?? 'examples/templates/showcase/vue-host');
const req = createRequire(path.join(root, 'package.json'));
const bin = path.join(path.dirname(req.resolve('vue-tsc/package.json')), 'bin/vue-tsc.js');
const dir = fs.mkdtempSync(path.join(root, '.bridge-types-'));
try {
  fs.writeFileSync(path.join(dir, 'modules.d.ts'), `declare module 'inline-test/bridge' { const app: ReturnType<typeof import('@fulgurjs/federation/vue').defineBridgeApp<{ userId: string }>>; export default app; }`);
  fs.writeFileSync(path.join(dir, 'registry.d.ts'), `import '@fulgurjs/federation/internal/registry.js';
  declare module '@fulgurjs/federation/internal/registry.js' { interface FgRemoteTypes { 'inline-test/bridge': typeof import('inline-test/bridge') } }`);
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: false, noEmit: true, types: [] }, include: ['*.vue', '*.d.ts'], vueCompilerOptions: { strictTemplates: true } }));
  for (const [value, valid] of [["{ userId: 'u' }", true], ['{ userId: 1 }', false], ['{}', false]]) {
    fs.writeFileSync(path.join(dir, 'App.vue'), `<script setup lang="ts">import { createVueBridgeApp } from '@fulgurjs/federation/vue'; const Bridge = createVueBridgeApp('inline-test/bridge');</script><template><Bridge :app-props="${value}" /></template>`);
    const result = spawnSync(process.execPath, [bin, '-p', path.join(dir, 'tsconfig.json')], { encoding: 'utf8' });
    const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    if (valid ? result.status !== 0 : result.status === 0 || !/App.vue.*error TS(2322|2741)/.test(text)) throw new Error(`内联参数 ${value} 未按预期检查：\n${text}`);
    console.log(`PASS ${valid ? '正确' : '错误'}内联参数 ${value}`);
  }
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
