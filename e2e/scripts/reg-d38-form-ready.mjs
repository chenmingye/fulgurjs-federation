// D38 回归：useForm 实例就绪合同（真实就绪事件 register / 清理 / 迟到任务 / 保存状态一致）
//
// 被测对象：公开 Jeecg 集成的真实 useForm.ts（app-a 与 app-b 同一份代码）：
//   examples/integrations/jeecg/app-b/src/components/Form/src/hooks/useForm.ts
// 旧实现 getForm() 只等一次 nextTick 后返回可能为 null 的实例 → 首帧调用
// setFieldsValue 在 error() 诊断处直接抛错（"form instance has not been obtained" +
// 微前端 PromiseRejectionEvent；独立站对照亦复现，属业务 hook 固有时序缺陷）。
//
// 同一条首帧用例同时驱动两份实现：
//   ① 修复前原实现逐字快照（LEGACY_USE_FORM_SOURCE）——必须复现原始失败；
//   ② 修复后的真实文件——必须等待 register、卸载时显式失败、不吞错、不用 setTimeout。
//
// 运行：node e2e/reg-d38-form-ready.mjs
// 依赖：esbuild/jsdom 取自 packages/plugin；vue 解析自 app-b 自身 node_modules（被测 hook 的真实运行时）。
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const requirePlugin = createRequire(path.join(REPO, 'packages/plugin/package.json'));
const esbuild = requirePlugin('esbuild');
const { JSDOM } = requirePlugin('jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
try {
  globalThis.navigator = dom.window.navigator;
} catch {
  // node 24 的 globalThis.navigator 只读；vue 运行时经 window.navigator 取值即可
}
globalThis.SVGElement = dom.window.SVGElement;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame?.bind(dom.window) ?? ((cb) => setTimeout(cb, 0));

// 修复前原实现的逐字快照（旧 getForm：报错后原样返回可能为 null 的实例）。仅作旧缺陷对照。
const LEGACY_USE_FORM_SOURCE = `
import { ref, onUnmounted, unref, nextTick, watch } from 'vue';
import { isProdMode } from '/@/utils/env';
import { error } from '/@/utils/log';
import { getDynamicProps } from '/@/utils';
export function useForm(props) {
  const formRef = ref(null);
  const loadedRef = ref(false);
  async function getForm() {
    const form = unref(formRef);
    if (!form) {
      error('The form instance has not been obtained, please make sure that the form has been rendered when performing the form operation!');
    }
    await nextTick();
    return form;
  }
  function register(instance) {
    isProdMode() &&
      onUnmounted(() => {
        formRef.value = null;
        loadedRef.value = null;
      });
    if (unref(loadedRef) && isProdMode() && instance === unref(formRef)) return;
    formRef.value = instance;
    loadedRef.value = true;
    watch(() => props, () => { props && instance.setProps(getDynamicProps(props)); }, { immediate: true, deep: true });
  }
  const methods = {
    setFieldsValue: async (values) => { const form = await getForm(); form.setFieldsValue(values); },
    setProps: async (formProps) => { const form = await getForm(); form.setProps(formProps); },
  };
  return [register, methods];
}
`;

const envShim = `let prodMode = true;\nexport const isProdMode = () => prodMode;\n`;
const logShim = `const errors = [];\nif (typeof window !== 'undefined') window.__d38errors = errors;\nexport const error = (...args) => { const message = args.join(' '); errors.push(message); throw new Error(message); };\n`;
const utilsShim = `export const getDynamicProps = (props) => props;\nexport const getValueType = () => 'string';\nexport const getValueTypeBySchema = () => 'string';\n`;
const formUtilsShim = `// 依赖 shim（非被测对象）：validate 结果区间值后处理，本回归直通。\nexport const handleRangeValue = (props, values) => values;\n`;
const dateUtilShim = `export const dateUtil = () => { throw new Error('not used in this regression'); };\n`;

const REAL_USE_FORM = path.join(REPO, 'examples/integrations/jeecg/app-b/src/components/Form/src/hooks/useForm.ts');

const entrySource = (useFormModule) => `
import { createApp, defineComponent, h, nextTick, onMounted } from 'vue';
import { useForm } from ${JSON.stringify(useFormModule)};

// 模拟 jeecg BasicForm：onMounted 时才 emit register —— 与真实组件时序一致。
// registerMode='never' 模拟表单在 v-if 下永不渲染（等待者只能靠卸载清理结束）。
const instances = [];
const BasicFormStub = defineComponent({
  name: 'BasicFormStub',
  emits: ['register'],
  props: { registerMode: { type: String, default: 'auto' } },
  setup(props, { emit }) {
    const instance = {
      values: {},
      props: {},
      setFieldsValue(v) { Object.assign(instance.values, v); },
      setProps(p) { Object.assign(instance.props, p); },
    };
    instances.push(instance);
    onMounted(() => { if (props.registerMode !== 'never') emit('register', instance); });
    return () => h('form', { 'data-stub': 'basic-form' });
  },
});

// 页面组件：setup 内先发起“首帧表单操作”（早于子组件 mounted → 早于 register）。
// 返回 app 句柄供用例显式卸载（onUnmounted 清理合同）。
function mountPage(capture, earlyCalls, registerMode = 'auto') {
  const Host = defineComponent({
    setup() {
      const [register, methods] = useForm();
      capture.register = register;
      capture.methods = methods;
      capture.instances = instances;
      earlyCalls.push(methods.setFieldsValue({ orderNo: 'A-001' }));
      earlyCalls.push(methods.setProps({ readonly: true }));
      return () => h(BasicFormStub, { onRegister: register, registerMode });
    },
  });
  const app = createApp(Host);
  const container = document.createElement('div');
  document.body.appendChild(container);
  app.mount(container);
  capture.app = app;
}

export { nextTick, mountPage };
`;

async function bundleUseForm(variant) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd38-reg-'));
  const write = (name, text) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, text);
    return file;
  };
  const shims = {
    '/@/utils/env': envShim,
    '/@/utils/log': logShim,
    '/@/utils': utilsShim,
    '/@/utils/dateUtil': dateUtilShim,
    '../utils/formUtils': formUtilsShim,
  };
  // esbuild alias 不接受这类说明符名称，用 onResolve/onLoad 插件精确拦截这五个非被测依赖
  const shimPlugin = {
    name: 'd38-jeecg-alias-shims',
    setup(build) {
      build.onResolve({ filter: /^(\.\.\/utils\/formUtils|\/@\/utils(\/.*)?)$/ }, (args) => ({
        path: args.path,
        namespace: 'd38-shim',
      }));
      build.onLoad({ filter: /.*/, namespace: 'd38-shim' }, (args) => ({
        contents: shims[args.path] ?? utilsShim,
        loader: 'js',
        resolveDir: dir,
      }));
    },
  };
  const useFormFile = write(variant === 'legacy' ? 'use-form-legacy.ts' : 'use-form-fixed.ts',
    variant === 'legacy' ? LEGACY_USE_FORM_SOURCE : fs.readFileSync(REAL_USE_FORM, 'utf8'));
  const entryFile = write('entry.ts', entrySource('./' + path.basename(useFormFile)));
  const out = await esbuild.build({
    entryPoints: [entryFile],
    bundle: true,
    format: 'esm',
    write: false,
    alias: {
      vue: path.join(REPO, 'examples/integrations/jeecg/app-b/node_modules/vue/index.mjs'),
    },
    plugins: [shimPlugin],
  });
  const outFile = write('entry.mjs', out.outputFiles[0].text);
  return { mod: await import(outFile), dir };
}

async function withMountedPage(bundle, registerMode, fn) {
  const capture = {};
  const earlyCalls = [];
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(String((reason && reason.message) || reason));
  process.on('unhandledRejection', onUnhandled);
  try {
    bundle.mod.mountPage(capture, earlyCalls, registerMode);
    return await fn({ capture, earlyCalls, unhandled });
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
}

test('D38-① 首帧竞态：修复前实现在同一用例上必须复现真实 error() 抛错；修复后等待 register 正常完成', { timeout: 20000 }, async () => {
  const legacy = await bundleUseForm('legacy');
  await assert.rejects(
    withMountedPage(legacy, 'auto', async ({ earlyCalls }) => {
      await Promise.all(earlyCalls);
    }),
    /The form instance has not been obtained/,
    '旧实现 error() 会抛错，等待注册无法完成'
  );

  const fixed = await bundleUseForm('fixed');
  await withMountedPage(fixed, 'auto', async ({ earlyCalls }) => {
    await Promise.all(earlyCalls);
  });
});

test('D38-② 首帧写入落到真实注册实例（保存状态一致）', { timeout: 20000 }, async () => {
  const fixed = await bundleUseForm('fixed');
  await withMountedPage(fixed, 'auto', async ({ capture, earlyCalls }) => {
    await Promise.all(earlyCalls);
    assert.equal(capture.instances.length, 1);
    assert.equal(capture.instances[0].values.orderNo, 'A-001', '早于 register 的 setFieldsValue 必须落到注册实例');
    assert.equal(capture.instances[0].props.readonly, true);
  });
});

test('D38-③ 表单永不注册 + 卸载：挂起操作以明确错误结束（不挂死、不吞错）', { timeout: 20000 }, async () => {
  const fixed = await bundleUseForm('fixed');
  const { capture, earlyCalls } = await withMountedPage(fixed, 'never', async ({ capture, earlyCalls }) => {
    await new Promise((r) => setTimeout(r, 10));
    capture.app.unmount();
    return { capture, earlyCalls };
  });
  assert.ok(capture.app);
  await assert.rejects(earlyCalls[0], /was unmounted before the form registered/);
  await assert.rejects(earlyCalls[1], /was unmounted before the form registered/);
});

test('D38-④ 注册后卸载再调用：显式失败而不是写死实例', { timeout: 20000 }, async () => {
  const fixed = await bundleUseForm('fixed');
  await assert.rejects(
    withMountedPage(fixed, 'auto', async ({ capture, earlyCalls }) => {
      await Promise.all(earlyCalls);
      capture.app.unmount();
      return capture.methods.setFieldsValue({ after: 1 });
    }),
    /was unmounted before the form registered/,
  );
});

test('D38-⑤ 正常等待不抛诊断错误，卸载后等待者收到明确失败', { timeout: 20000 }, async () => {
  globalThis.window.__d38errors = [];
  const fixed = await bundleUseForm('fixed');
  await withMountedPage(fixed, 'never', async ({ capture, earlyCalls, unhandled }) => {
    const observed = Promise.allSettled(earlyCalls);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(unhandled.length, 0);
    assert.equal((globalThis.window.__d38errors || []).length, 0);
    capture.app.unmount();
    const outcomes = await observed;
    assert.ok(outcomes.every((x) => x.status === 'rejected' && /was unmounted/.test(x.reason.message)));
  });
});
