/**
 * D.2 宿主路由表校验器（defineFulgurPages）
 *
 * 背景：带参路由缺省推导 spec 时会剥离 :参数 段，可能与其它条目（如列表页）的
 * expose 键收敛相同 → 静默加载错误组件（真实事故：复制流程误走更新语义）。
 *
 * 定位：纯同步纯函数，dev（宿主浏览器模块求值）与 build（node）行为一致；
 * 只校验不改写入参；ERROR 级聚合一次 throw（strict:false 降级 console.error），
 * WARN 级聚合 console.warn。
 *
 * 规则：
 * - R1 [ERROR] 带参路由（无显式 spec）的推导 spec 与任一其它条目的有效 spec 相同
 * - R2 [WARN]  多条目的有效 spec 完全相同（可能是刻意的菜单别名，要求有意识）
 * - R3 [ERROR] schema 提供时：有效 spec 的 exposes 键不在对应 remote 清单中
 *              （把运行时 MFU-006 提前到启动期；schema 缺失/remote 不可达则跳过）
 * - R4 [ERROR] 静态路由被数组中更靠前的带参路由遮蔽（先到先得 → 静态路由成死路由）；
 *              含路由完全重复
 * - R5 [WARN]  name 字段重复（vue-router 命名跳转歧义）
 */

export interface FulgurPageRouteLike {
  /** 宿主路由路径（:param 段） */
  route: string;
  /** 显式 spec（缺省走推导） */
  spec?: string;
  /** 其余字段（name/title/...）由宿主自由扩展，校验器按需读取 */
  name?: string;
  [key: string]: unknown;
}

export interface RemoteSchemaEntry {
  /** 该 remote 的 exposes 键清单（与 spec 同口径，剥 ./ 前缀比较） */
  exposes: string[];
  /** manifest 是否成功拉取（false 时跳过该 remote 的 R3，诚实降级） */
  exists?: boolean;
}

export interface FulgurPagesOptions {
  /**
   * 带参路由的缺省 spec 推导规则（宿主私有约定，如
   * (route) => `pages/${route 去前缀去 :参}`）。
   * 缺省 = 去掉首段（远程前缀）+ 剥 :参 段（无 pages/ 前缀）——
   * 推导只需在全部条目间自洽即可保持冲突判定成立。
   */
  deriveSpec?: (route: string) => string;
  /** 路由前缀 → remote 名（R3 用：{'/lowcode/': 'mes-lowcode'}）；缺省跳过 R3 */
  remotes?: Record<string, string>;
  /** remote exposes 清单（dev 由 virtual:fulgur-remote-schema 提供）；缺省跳过 R3 */
  schema?: Record<string, RemoteSchemaEntry>;
  /** false = ERROR 降级 console.error（默认 true = throw） */
  strict?: boolean;
}

const normSpec = (s: string): string => s.replace(/^[./]+/, '').replace(/\/+$/, '');
const hasParam = (route: string): boolean => /(^|\/):[\w]+/.test(route);
const segs = (route: string): string[] => route.split('/').filter(Boolean);

/** 缺省推导：去首段（远程前缀）+ 剥 :参 段 */
function defaultDeriveSpec(route: string): string {
  return segs(route)
    .slice(1)
    .filter((seg) => !seg.startsWith(':'))
    .join('/');
}

/** R4：earlier（数组中更靠前）是否遮蔽 later —— 同段数且逐段「相等或 earlier 为 :参」 */
function shadows(earlier: string, later: string): 'full' | 'param' | null {
  const a = segs(earlier);
  const b = segs(later);
  if (a.length !== b.length) return null;
  if (earlier === later) return 'full';
  let hasParam = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (a[i].startsWith(':')) {
      hasParam = true;
      continue;
    }
    return null;
  }
  return hasParam ? 'param' : null;
}

function remoteOfRoute(route: string, remotes?: Record<string, string>): string | null {
  if (!remotes) return null;
  for (const [prefix, name] of Object.entries(remotes)) {
    if (route === prefix.replace(/\/+$/, '') || route.startsWith(prefix)) return name;
  }
  return null;
}

export interface PageViolation {
  rule: 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
  level: 'error' | 'warn';
  message: string;
}

/**
 * 校验路由表（独立导出便于单测）：返回违例清单（不抛错）。
 */
export function validateFulgurPages(
  pages: FulgurPageRouteLike[],
  options: FulgurPagesOptions = {},
): PageViolation[] {
  const deriveSpec = options.deriveSpec ?? defaultDeriveSpec;
  const violations: PageViolation[] = [];
  const effective = pages.map((p) => normSpec(p.spec ?? deriveSpec(p.route)));

  // R1：带参 + 无显式 spec 的推导 spec 与任一其它条目的有效 spec 相同
  pages.forEach((p, i) => {
    if (p.spec || !hasParam(p.route)) return;
    pages.forEach((q, j) => {
      if (i === j) return;
      if (effective[j] !== effective[i]) return;
      violations.push({
        rule: 'R1',
        level: 'error',
        message:
          `[R1] 路由 "${p.route}" 剥参推导 spec "${effective[i]}" 与路由 "${q.route}"` +
          `${q.spec ? '（显式 spec）' : ''}收敛相同。\n` +
          `   根因：参数段剥离后 expose 键与其它条目相同，该路由会静默加载错误组件\n` +
          `   （真实事故：带参动作页误走列表/更新语义，数据风险）。\n` +
          `   修法：为该条目显式声明 spec: '...'（指向带参页面自己的 expose），或调整路由拆分。`,
      });
    });
  });

  // R2：有效 spec 重复（去重报告，每组一条 WARN）
  const seenSpec = new Map<string, number>();
  pages.forEach((p, i) => {
    const key = effective[i];
    if (seenSpec.has(key)) {
      const first = pages[seenSpec.get(key)!];
      const bothExplicit = !!p.spec && !!first.spec;
      violations.push({
        rule: 'R2',
        level: 'warn',
        message:
          `[R2] 路由 "${p.route}" 与 "${first.route}" 有效 spec 相同（"${key}"）。` +
          `${bothExplicit ? '两条均为显式 spec' : '其中含推导 spec'}——` +
          `若为刻意的菜单别名可忽略本警告，否则请核对。`,
      });
    } else {
      seenSpec.set(key, i);
    }
  });

  // R3：spec 存在性（schema 提供且该 remote 可达时）
  if (options.schema && options.remotes) {
    pages.forEach((p, i) => {
      const remote = remoteOfRoute(p.route, options.remotes);
      if (!remote) return;
      const entry = options.schema![remote];
      if (!entry || entry.exists === false) return; // 诚实降级：拉取失败的 remote 不误报
      const exposes = new Set((entry.exposes ?? []).map(normSpec));
      if (!exposes.has(effective[i])) {
        violations.push({
          rule: 'R3',
          level: 'error',
          message:
            `[R3] 路由 "${p.route}" 的 spec "${effective[i]}" 不在远程 "${remote}" 的 exposes 清单中。\n` +
            `   根因：spec 拼写与远程 exposes 键不一致（运行时将 MFU-006 加载失败）。\n` +
            `   修法：核对远程 vite.config exposes 键名，或修正本表 spec。\n` +
            `   远程实际 exposes（前 10）：${[...exposes].slice(0, 10).join('、') || '（空）'}`,
        });
      }
    });
  }

  // R4：路由遮蔽（先到先得）+ 完全重复
  pages.forEach((p, i) => {
    pages.forEach((q, j) => {
      if (j <= i) return;
      const kind = shadows(p.route, q.route);
      if (!kind) return;
      violations.push({
        rule: 'R4',
        level: 'error',
        message:
          kind === 'full'
            ? `[R4] 路由完全重复："${p.route}"（第 ${i + 1} 条）与 "${q.route}"（第 ${j + 1} 条）。`
            : `[R4] 路由 "${q.route}"（第 ${j + 1} 条）会被更靠前的 "${p.route}" 遮蔽` +
              `（匹配先到先得，后者成死路由）。\n` +
              `   修法：调整数组顺序（更具体的静态路由放前面）或合并条目。`,
      });
    });
  });

  // R5：name 重复
  const seenName = new Map<string, number>();
  pages.forEach((p, i) => {
    const name = typeof p.name === 'string' ? p.name : '';
    if (!name) return;
    if (seenName.has(name)) {
      violations.push({
        rule: 'R5',
        level: 'warn',
        message:
          `[R5] name "${name}" 重复（"${pages[seenName.get(name)!].route}" 与 "${p.route}"）` +
          `——vue-router 命名跳转 push({name}) 将命中前者，请核对。`,
      });
    } else {
      seenName.set(name, i);
    }
  });

  return violations;
}

function formatViolations(violations: PageViolation[]): string {
  const errors = violations.filter((v) => v.level === 'error');
  const warns = violations.filter((v) => v.level === 'warn');
  let out = '';
  if (errors.length) {
    out += `[fulgur] 路由表校验失败（${errors.length} 项，ERROR）：\n` + errors.map((v) => v.message).join('\n') + '\n';
  }
  if (warns.length) {
    out += `[fulgur] 路由表校验警告（${warns.length} 项，WARN）：\n` + warns.map((v) => v.message).join('\n');
  }
  return out.trim();
}

/**
 * 宿主路由表定义入口：校验（聚合报错）后原样返回入参，不改写任何字段。
 * 违反 ERROR 级规则时默认 throw（dev overlay / build 失败直接可见）；
 * strict: false 时降级 console.error。WARN 级始终 console.warn。
 */
export function defineFulgurPages<P extends FulgurPageRouteLike[]>(
  pages: P,
  options: FulgurPagesOptions = {},
): P {
  const violations = validateFulgurPages(pages, options);
  const errors = violations.filter((v) => v.level === 'error');
  const warns = violations.filter((v) => v.level === 'warn');
  const text = formatViolations(violations);
  if (text) {
    if (errors.length && options.strict !== false) {
      throw new Error(text);
    }
    // eslint-disable-next-line no-console
    console[errors.length ? 'error' : 'warn'](text);
  }
  return pages;
}
