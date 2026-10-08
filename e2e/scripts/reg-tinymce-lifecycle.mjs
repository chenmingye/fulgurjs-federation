// 使用实际组件中的生命周期代码与真实 Vue 挂载/KeepAlive，控制 TinyMCE 的异步完成时机。
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  req = createRequire(root + '/packages/plugin/package.json'),
  { transformSync } = req('esbuild'),
  { JSDOM } = req('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement', 'Node'])
  globalThis[key] = key === 'window' ? dom.window : dom.window[key];
const fixture = createRequire(root + '/fixtures/host-vue/package.json');
const Vue = await import(fixture.resolve('vue'));
const {
  createApp,
  defineComponent,
  h,
  ref,
  shallowRef,
  unref,
  nextTick,
  onMounted,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  KeepAlive,
} = Vue;
const hook = fs
  .readFileSync(root + '/examples/integrations/jeecg/app-a/src/hooks/core/onMountedOrActivated.ts', 'utf8')
  .replace(/^import[^\n]+\n/, '')
  .replace('export function', 'function');
const mountHook = new Function(
  'nextTick',
  'onMounted',
  'onActivated',
  transformSync(hook, { loader: 'ts' }).code + ';return onMountedOrActivated',
)(nextTick, onMounted, onActivated);
const files = ['app-a', 'app-b'].map(
  (n) => root + `/examples/integrations/jeecg/${n}/src/components/Tinymce/src/Editor.vue`,
);
const blocks = files.map((p) => {
  const source = fs.readFileSync(p, 'utf8');
  assert(!source.includes('<Editor\n'), '不能同时由第三方 Vue 组件和本组件重复初始化');
  return source.slice(source.indexOf('      let editorGeneration ='), source.indexOf('      function initSetup(e)'));
});
assert.equal(blocks[0], blocks[1]);
const editorRefDeclarations = files.map((p) => fs.readFileSync(p, 'utf8').match(/const editorRef = [^;]+;/)[0]);
assert.equal(editorRefDeclarations[0], editorRefDeclarations[1]);
const createEditorRef = new Function(
  'ref',
  'shallowRef',
  transformSync(editorRefDeclarations[0], { loader: 'ts' }).code + ';return editorRef;',
);

const run = new Function(
  'onMountedOrActivated',
  'onBeforeUnmount',
  'onDeactivated',
  'nextTick',
  'unref',
  'initOptions',
  'tinymceId',
  'elRef',
  'editorRef',
  'disabled',
  'buildShortUUID',
  'tinymce',
  'changeColor',
  'emit',
  transformSync(blocks[0], { loader: 'ts' }).code,
);
const pause = () => new Promise((r) => setTimeout(r, 55));
const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
};
function mount(keep = false) {
  const calls = [],
    events = [],
    active = ref(true);
  let seq = 0;
  const Child = defineComponent({
    name: 'TestEditor',
    setup() {
      const el = ref(null),
        editorRef = createEditorRef(ref, shallowRef),
        id = ref('initial'),
        options = ref({
          inline: false,
          setup(editor) {
            editorRef.value = editor;
          },
        });
      run(
        mountHook,
        onBeforeUnmount,
        onDeactivated,
        nextTick,
        unref,
        options,
        id,
        el,
        editorRef,
        ref(true),
        () => `test-${++seq}`,
        {
          init(options) {
            let resolve, reject;
            const editor = {
              initialized: false,
              removed: false,
              removes: 0,
              remove() {
                assert.equal(this, editor, 'TinyMCE 释放必须使用原始实例身份');
                this.removed = true;
                this.removes++;
              },
            };
            options.setup(editor);
            const promise = new Promise((a, b) => {
              resolve = () => {
                editor.initialized = true;
                a([editor]);
              };
              reject = b;
            });
            calls.push({ editor, resolve, reject, options });
            return promise;
          },
        },
        () => {},
        (...e) => events.push(e),
      );
      return () => h('textarea', { id: id.value, ref: el });
    },
  });
  const target = document.createElement('div');
  document.body.append(target);
  const app = createApp({
    render: () => (keep ? h(KeepAlive, null, { default: () => (active.value ? h(Child) : null) }) : h(Child)),
  });
  app.mount(target);
  return {
    app,
    target,
    calls,
    events,
    active,
    dispose() {
      app.unmount();
      target.remove();
    },
  };
}
test('正常初始化仅一次，显式目标与只读设置正确，完成后卸载释放', async () => {
  const t = mount();
  await pause();
  assert.equal(t.calls.length, 1);
  const c = t.calls[0];
  assert(c.options.target.isConnected);
  assert.equal(c.options.readonly, true);
  c.resolve();
  await flush();
  assert.equal(t.events.length, 1);
  assert.equal(t.events[0][0], 'inited');
  t.dispose();
  assert.equal(c.editor.removes, 1);
});
test('nextTick/延迟回调前卸载，不启动已失效初始化', async () => {
  const t = mount();
  t.dispose();
  await pause();
  assert.equal(t.calls.length, 0);
});
test('初始化未完成时立即取消；迟到完成不重复释放或发就绪事件', async () => {
  const t = mount();
  await pause();
  const c = t.calls[0];
  t.dispose();
  assert.equal(c.editor.removes, 1);
  c.resolve();
  await flush();
  assert.equal(c.editor.removes, 1);
  assert.equal(t.events.length, 0);
});
test('卸载后的拒绝已处理，不向失效组件发错误事件', async () => {
  const t = mount();
  await pause();
  const c = t.calls[0];
  t.dispose();
  c.reject(Error('controlled late init failure'));
  await flush();
  assert.equal(t.events.length, 0);
  assert.equal(c.editor.removes, 1);
});
test('当前初始化失败仍发 init-error，不吞可见故障', async () => {
  const t = mount();
  await pause();
  t.calls[0].reject(Error('controlled current init failure'));
  await flush();
  assert.equal(t.events[0][0], 'init-error');
  assert.match(t.events[0][1].message, /controlled/);
  assert.equal(t.calls[0].editor.removes, 1);
  t.dispose();
});
test('KeepAlive 旧代次迟到不影响新实例，新旧实例各释放一次', async () => {
  const t = mount(true);
  await pause();
  assert.equal(t.calls.length, 1);
  const old = t.calls[0];
  t.active.value = false;
  await nextTick();
  assert.equal(old.editor.removes, 1);
  t.active.value = true;
  await nextTick();
  await pause();
  assert.equal(t.calls.length, 2);
  const current = t.calls[1];
  old.resolve();
  await flush();
  assert.equal(old.editor.removes, 1);
  assert.equal(current.editor.removes, 0);
  assert.equal(t.events.length, 0);
  current.resolve();
  await flush();
  assert.equal(t.events.length, 1);
  t.dispose();
  assert.equal(current.editor.removes, 1);
});

// 从 pnpm 补丁的真实 TinyMCE 初始化函数执行正常与取消两条路径。
const vendorPatch = fs.readFileSync(root + '/examples/integrations/jeecg/patches/tinymce-6.6.2.patch', 'utf8');
const patchedContext = vendorPatch
  .split('\n')
  .filter((line) => (line.startsWith(' ') || line.startsWith('+')) && !line.startsWith('+++'))
  .map((line) => line.slice(1))
  .join('\n');
const vendorInit = patchedContext.match(/const init = async editor => \{[\s\S]+?\n    \};/)[0];
function vendorHarness(cancelGuard = true) {
  let complete;
  const pending = new Promise((resolve) => {
    complete = resolve;
  });
  const calls = [];
  const body = cancelGuard
    ? vendorInit
    : vendorInit.replace(/      if \(editor.removed\) \{\n        return;\n      \}\n/, '');
  const init = new Function(
    'initIcons',
    'initTheme',
    'initModel',
    'initPlugins',
    'renderThemeUi',
    'augmentEditorUiApi',
    'Optional',
    'appendContentCssFromSettings',
    'contentBodyLoaded',
    'init$1',
    body + ';return init;',
  )(
    () => {},
    () => {},
    () => {},
    () => {},
    () => pending,
    () => calls.push('ui'),
    { from: (value) => ({ getOr: (fallback) => value ?? fallback }) },
    () => calls.push('css'),
    () => calls.push('body'),
    (_editor, info) => {
      if (!info.iframeContainer) throw new Error('Node cannot be null or undefined');
      calls.push('iframe');
    },
  );
  return { init, complete, calls };
}
test('TinyMCE 正常异步初始化继续建立 UI 与 iframe', async () => {
  const h = vendorHarness();
  const editor = { removed: false, inline: false, dispatch() {} };
  const pending = h.init(editor);
  h.complete({ api: {}, editorContainer: {}, iframeContainer: {} });
  await pending;
  assert.deepEqual(h.calls, ['ui', 'css', 'iframe']);
});
test('TinyMCE await 期间移除后停止初始化；去掉补丁可复现空容器错误', async () => {
  const h = vendorHarness();
  const editor = { removed: false, inline: false, dispatch() {} };
  const pending = h.init(editor);
  editor.removed = true;
  h.complete({ api: {}, editorContainer: null, iframeContainer: null });
  await pending;
  assert.deepEqual(h.calls, []);
  const old = vendorHarness(false);
  const failed = old.init(editor);
  old.complete({ api: {}, editorContainer: null, iframeContainer: null });
  await assert.rejects(failed, /Node cannot be null or undefined/);
});
