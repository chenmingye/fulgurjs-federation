/** 在隔离的Vue编译进程内记录实际输入，避免dev冷生成前再运行一套依赖扫描。 */
import { genTypeInputBytes } from './dts-input-hash'

export function genTypesInputRecorder(): string {
  return String.raw`
const crypto = require('node:crypto');
${genTypeInputBytes()}
const traceFile = generationInput.traceFile;
const toolStarted = Date.now() - process.uptime() * 1000;
const traceStarted = Number(generationInput.started) || toolStarted;
const parentInputs = generationInput.parentInputs || { files: {} };
const snapshot = { caseSensitive: ts.sys.useCaseSensitiveFileNames, directoryStats: {}, files: parentInputs.files, probes: parentInputs.probes || {}, fileQueries: parentInputs.fileQueries || {}, directories: parentInputs.directories || [], links: parentInputs.links || {}, resolutions: [], runtimeTools: [] };
const ignoredPaths=new Map();
const ignoredInput = file => { if(ignoredPaths.has(file))return ignoredPaths.get(file);const value=path.resolve(file).split(path.sep).some(name=>name.startsWith('.fulgurjs-types-'));ignoredPaths.set(file,value);return value; };
const readStamp = file => {
  const before = fs.statSync(file);
  const bytes = fs.readFileSync(file);
  const after = fs.statSync(file);
  if (before.ctimeMs !== after.ctimeMs || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino || before.size !== after.size) throw Error('类型输入读取期间发生变化');
  return { hash: crypto.createHash('sha256').update(typeInputBytes(file,bytes)).digest('hex'), size: after.size, mtime: after.mtimeMs, ctime: after.ctimeMs, ino: after.ino };
};
let traceValid = !parentInputs.changed;
let inputChanged = !!parentInputs.changed;
const recordFile = file => {
  file = path.resolve(file);
  if (!traceFile || ignoredInput(file)) return;
  try { const previous=snapshot.files[file];const stat=fs.statSync(file);const same=previous&&previous.ctime===stat.ctimeMs&&previous.mtime===stat.mtimeMs&&previous.ino===stat.ino&&previous.size===stat.size; const next = same ? previous : readStamp(file); if (previous && (previous.ctime !== next.ctime || previous.mtime !== next.mtime || previous.ino !== next.ino || previous.hash !== next.hash)) { traceValid = false; inputChanged = true; } snapshot.files[file] = next; const real = fs.realpathSync(file); if (snapshot.links[file] && snapshot.links[file] !== real) { traceValid = false; inputChanged = true; } snapshot.links[file] = real; }
  catch { traceValid = false; }
};
// 同一次解析会反复询问相同目录，缺失目录还会反复向上找父目录。
// 首次记录已保存存在父级的时间戳；发布前照常校验查询结果与目录变化。
// 这里只去重记录，不缓存fileExists/directoryExists的实际结果，避免遮住生成中的变化。
const recordedDirectories = new Set();
const recordDirectory = directory => {
  if (recordedDirectories.has(directory)) return;
  recordedDirectories.add(directory);
  directory = path.resolve(directory);
  if (!traceFile || ignoredInput(directory) || snapshot.directoryStats[directory]) return;
  for (;;) {
    if(snapshot.directoryStats[directory])return;
    try { const stat = fs.statSync(directory); if (stat.isDirectory()) snapshot.directoryStats[directory] = { mtime: stat.mtimeMs, ctime: stat.ctimeMs, ino: stat.ino }; return; }
    catch { const parent = path.dirname(directory); if (parent === directory) return; directory = parent; }
  }
};
if (traceFile) {
  const originalRead = ts.sys.readFile;
  ts.sys.readFile = (file, ...args) => {
    let before;
    try { before = fs.statSync(file); } catch {}
    const text = originalRead(file, ...args);
    if (text !== undefined && !ignoredInput(file)) {
      recordFile(file);
      const stamp = snapshot.files[path.resolve(file)];
      if (!before || !stamp || before.ctimeMs !== stamp.ctime || before.mtimeMs !== stamp.mtime || before.ino !== stamp.ino || before.size !== stamp.size) { traceValid = false; inputChanged = true; }
    }
    return text;
  };
  const originalExists = ts.sys.fileExists;
  ts.sys.fileExists = file => {
    const value = originalExists(file); const absolute = path.resolve(file);
    if (!ignoredInput(absolute)) {
      const directory = path.dirname(absolute); recordDirectory(directory); recordDirectory(path.dirname(directory));
      const queries = snapshot.fileQueries[directory] ||= Object.create(null); const name = path.basename(absolute);
      if (!absolute.split(path.sep).includes('.vue-global-types') && Object.hasOwn(queries, name) && queries[name] !== value) { traceValid = false; inputChanged = true; }
      queries[name] = value;
    }
    return value;
  };
  const originalSize = ts.sys.getFileSize;
  if (originalSize) ts.sys.getFileSize = file => {
    const value = originalSize(file);
    if (originalExists(file)) recordFile(file);
    return value;
  };
  const originalDirectoryExists = ts.sys.directoryExists;
  ts.sys.directoryExists = directory => {
    const value = originalDirectoryExists(directory); const absolute = path.resolve(directory);
    if (!ignoredInput(absolute)) { const key = 'd:' + absolute; if (!absolute.split(path.sep).includes('.vue-global-types') && Object.hasOwn(snapshot.probes, key) && snapshot.probes[key] !== value) { traceValid = false; inputChanged = true; } snapshot.probes[key] = value; recordDirectory(absolute); recordDirectory(path.dirname(absolute)); }
    return value;
  };
  for (const [method, kind] of [['readDirectory', 'files'], ['getDirectories', 'dirs']]) {
    const original = ts.sys[method];
    ts.sys[method] = (directory, ...args) => {
      const result = original(directory, ...args);
      if (!ignoredInput(directory)) {
        recordDirectory(directory);
        snapshot.directories.push({ kind, root: directory, ...(kind === 'files' ? { extensions: args[0], excludes: args[1], includes: args[2], depth: args[3] } : {}), result: result.filter(file => !ignoredInput(file)).sort() });
      }
      return result;
    };
  }
  const originalRealpath = ts.sys.realpath;
  if (originalRealpath) ts.sys.realpath = file => {
    const result = originalRealpath(file);
    if (!ignoredInput(file)) { try { const key = path.resolve(file), real = fs.realpathSync(file); if (snapshot.links[key] && snapshot.links[key] !== real) { traceValid = false; inputChanged = true; } snapshot.links[key] = real; } catch {} }
    return result;
  };
}
const finishInputTrace = () => {
  if (!traceFile) return;
  for (const file of Object.keys(snapshot.files)) {
    if (file.endsWith('.json')) {
      try {
        const options = ts.parseConfigFileTextToJson(file, fs.readFileSync(file, 'utf8')).config?.vueCompilerOptions;
        if (options?.plugins?.length || options?.hooks?.length) traceValid = false;
      } catch { traceValid = false; }
    }
    if (file.endsWith('.vue')) {
      const {descriptor} = req('vue/compiler-sfc').parse(fs.readFileSync(file, 'utf8'));
      if (descriptor.template?.src || (descriptor.template?.lang && descriptor.template.lang !== 'html') || descriptor.styles.some(style => style.module && style.src)) traceValid = false;
    }
  }
  for (const file of Object.keys(require.cache)) {
    if (ignoredInput(file)) continue;
    recordFile(file);
    snapshot.runtimeTools.push(file);
    // CJS代码已在本进程加载，期间改动的工具不能被记作当前执行内容。
    if ((snapshot.files[file]?.ctime ?? Infinity) > toolStarted) traceValid = false;
  }
  // Node加载器不会把所有package.json与逻辑node_modules链接交给TS host，另记实际模块父子边。
  const observedPackages = new Set();
  for (const module of Object.values(require.cache)) {
    let directory = path.dirname(module.filename);
    while (!observedPackages.has(directory)) {
      observedPackages.add(directory);
      const json = path.join(directory, 'package.json');
      if (fs.existsSync(json)) { recordFile(json); break; }
      const parent = path.dirname(directory); if (parent === directory) break; directory = parent;
    }
    for (const child of module.children) {
      const index = child.filename.lastIndexOf(path.sep + 'node_modules' + path.sep);
      if (index < 0) continue;
      const parts = child.filename.slice(index + 14).split(path.sep);
      const name = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
      for (const base of module.paths || []) {
        const candidate = path.join(base, name);
        let exists = false; try { exists = fs.statSync(candidate).isDirectory(); } catch {}
        snapshot.probes['d:' + candidate] = exists; recordDirectory(path.dirname(candidate));
        if (!exists) continue;
        try {
          const real = fs.realpathSync(candidate); if (snapshot.links[candidate] && snapshot.links[candidate] !== real) { traceValid = false; inputChanged = true; } snapshot.links[candidate] = real;
          if (!(child.filename === real || child.filename.startsWith(real + path.sep))) traceValid = false;
        } catch { traceValid = false; }
        break;
      }
    }
  }
  for (const request of ['typescript', 'vue-tsc', 'vue/compiler-sfc']) {
    try { snapshot.resolutions.push({ from: path.join(process.cwd(), 'package.json'), request, resolved: req.resolve(request) }); } catch {}
  }
  if (!traceValid && !inputChanged) return;
  try { fs.writeFileSync(traceFile, JSON.stringify({ format: 1, changed: inputChanged, root: process.cwd(), started: traceStarted, ambientInputs: generationInput.ambientInputs, snapshot })); }
  catch { /* 类型成功仍可提供；不写缓存不能伪装成编译失败 */ }
};
`
}
