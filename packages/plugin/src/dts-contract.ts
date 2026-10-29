/**
 * 公开合同投影：仅供开发期类型分发，不替代业务实现检查。
 *
 * TS/TSX 使用提供方 TypeScript 的 isolatedDeclarations 诊断裁决；不能独立生成
 * 精确声明时返回未投影状态，由合同边界拒绝读取实现。Vue 处理可确认的非泛型 script-setup 公共合同，
 * 声明仍由官方 Vue Program 生成；复杂语法给出定位，不自动退回完整源码。
 * 投影只存在于编译器读取视图，不写源码、不改变 Vite 的运行时代码。
 */
import type * as TS from 'typescript'

/** 父进程和隔离 Vue 编译进程使用同一实现，避免两次建立不同的依赖图。 */
export function genContractProjection(): string {
  return String.raw`
// 只认识本插件自己定义的桥接工厂；不推测第三方工厂的返回类型。
function projectBridgeFactories(file, text) {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const names = new Set();
    let shadow = false;
    for (const s of source.statements) {
        if (s.name && ['ReturnType', 'Record', 'globalThis'].includes(s.name.text))
            shadow = true;
        if (ts.isVariableStatement(s) && s.declarationList.declarations.some(d => ts.isIdentifier(d.name) && ['ReturnType', 'Record', 'globalThis'].includes(d.name.text)))
            shadow = true;
        if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier))
            continue;
        if (s.importClause?.name && ['ReturnType', 'Record', 'globalThis'].includes(s.importClause.name.text))
            shadow = true;
        const bindings = s.importClause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings) && ['ReturnType', 'Record', 'globalThis'].includes(bindings.name.text))
            shadow = true;
        if (bindings && ts.isNamedImports(bindings))
            for (const e of bindings.elements) {
                if (['ReturnType', 'Record', 'globalThis'].includes(e.name.text))
                    shadow = true;
                if (['@fulgurjs/federation/vue', '@fulgurjs/federation/react'].includes(s.moduleSpecifier.text)
                    && ['defineBridgeApp', 'defineApplication'].includes(e.propertyName?.text || e.name.text))
                    names.add(e.name.text);
            }
    }
    if (shadow || !names.size)
        return text;
    const printer = ts.createPrinter({ removeComments: false });
    const edits = [];
    const replacement = call => {
        if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || !names.has(call.expression.text)
            || call.arguments.length < 1 || call.arguments.length > 2 || call.typeArguments?.length > 1)
            return;
        let props = call.typeArguments?.[0];
        if (!props) {
            const factory = call.arguments[0];
            if (!(ts.isArrowFunction(factory) || ts.isFunctionExpression(factory)) || factory.typeParameters?.length || factory.asteriskToken)
                return;
            const p = factory.parameters[0];
            if (p && (p.questionToken || p.initializer || p.dotDotDotToken || !ts.isIdentifier(p.name) || p.name.text === 'this'))
                return;
            props = p?.type || ts.factory.createTypeReferenceNode('Record', [
                ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword), ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
            ]);
        }
        // SDK工厂的公开返回类型只由P决定，与创建App/router的实现无关。
        return ts.factory.createAsExpression(ts.factory.createIdentifier('undefined'), ts.factory.createTypeReferenceNode('ReturnType', [ts.factory.createTypeQueryNode(call.expression, [props])]));
    };
    for (const s of source.statements) {
        const candidates = ts.isExportAssignment(s) ? [s.expression] : ts.isVariableStatement(s)
            ? s.declarationList.declarations.filter(d => !d.type && d.initializer).map(d => d.initializer) : [];
        for (const expr of candidates) {
            const next = replacement(expr);
            if (next)
                edits.push({ start: expr.getStart(source), end: expr.end, text: printer.printNode(ts.EmitHint.Expression, next, source) });
        }
    }
    let output = text;
    for (const edit of edits.sort((a, b) => b.start - a.start))
        output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    return output;
}
// 纯具名类型消费只需要对应导出及其本地依赖，不让同文件无关值导出触发实现推导。
function selectContractTypes(file, text) {
    const names = contractTypeNames[file];
    if (!Array.isArray(names)) return text;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const used = new Set(names), keep = new Set();
    const identifiers = node => {
        if (ts.isIdentifier(node)) {
            const parent = node.parent;
            const declarationName = parent && parent.name === node && !ts.isTypeReferenceNode(parent);
            const memberName = parent && ts.isQualifiedName(parent) && parent.right === node;
            if (!declarationName && !memberName) used.add(node.text);
        }
        ts.forEachChild(node, child => { if (!(ts.isFunctionLike(node) && child === node.body)) identifiers(child); });
    };
    for (;;) {
        let changed = false;
        for (const statement of source.statements) {
            if (keep.has(statement)) continue;
            let selected = statement.name && ts.isIdentifier(statement.name) && used.has(statement.name.text);
            if (ts.isVariableStatement(statement)) selected = statement.declarationList.declarations.some(d => ts.isIdentifier(d.name) && used.has(d.name.text));
            if (ts.isExportDeclaration(statement)) selected = !statement.exportClause
                || (ts.isNamedExports(statement.exportClause) && statement.exportClause.elements.some(e => used.has(e.name.text)));
            if (ts.isModuleDeclaration(statement)) selected = selected || !!(statement.flags & ts.NodeFlags.GlobalAugmentation) || ts.isStringLiteral(statement.name);
            if (!selected) continue;
            keep.add(statement); identifiers(statement); changed = true;
        }
        if (!changed) break;
    }
    const printer = ts.createPrinter({removeComments:false});
    return source.statements.filter(statement => keep.has(statement) || ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement))
        .map(statement => {
            if (ts.isVariableStatement(statement)) statement = ts.factory.updateVariableStatement(statement, statement.modifiers,
                ts.factory.updateVariableDeclarationList(statement.declarationList, statement.declarationList.declarations.filter(d => ts.isIdentifier(d.name) && used.has(d.name.text))));
            return printer.printNode(ts.EmitHint.Unspecified, statement, source);
        }).join('\n') + '\n';
}
// .d.ts中默认函数/类隐含ambient；投影仍按.ts/.tsx被读取，必须显式declare。
// 保留默认导出的原名字/泛型/重载，不给缺失签名补any，也不添加运行时实现。
function normalizeContractDeclaration(file, text) {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const used = new Set();
    const scan = node => { if (ts.isIdentifier(node)) used.add(node.text); ts.forEachChild(node, scan); };
    scan(source);
    const defaults = new Set(), statements = [];
    let serial = 0;
    for (let statement of source.statements) {
        if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement))
            && statement.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) {
            let name = statement.name;
            if (!name) {
                let value; do { value = '__fulgurjs_default_' + (++serial); } while (used.has(value));
                used.add(value); name = ts.factory.createIdentifier(value);
            }
            const modifiers = [ts.factory.createModifier(ts.SyntaxKind.DeclareKeyword),
                ...statement.modifiers.filter(m => ![ts.SyntaxKind.ExportKeyword, ts.SyntaxKind.DefaultKeyword, ts.SyntaxKind.DeclareKeyword].includes(m.kind))];
            statement = ts.isFunctionDeclaration(statement)
                ? ts.factory.updateFunctionDeclaration(statement, modifiers, statement.asteriskToken, name, statement.typeParameters, statement.parameters, statement.type, undefined)
                : ts.factory.updateClassDeclaration(statement, modifiers, name, statement.typeParameters, statement.heritageClauses, statement.members);
            defaults.add(name.text);
        }
        statements.push(statement);
    }
    for (const name of defaults) statements.push(ts.factory.createExportAssignment(undefined, false, ts.factory.createIdentifier(name)));
    return ts.createPrinter({removeComments:false}).printFile(ts.factory.updateSourceFile(source,statements));
}
function projectContract(file, text) {
    projectContract.supported = false;
    projectContract.reason = undefined;
    if (typeof text !== 'string' || /(?:^|[/\\])node_modules(?:[/\\]|$)/.test(file)
        || /\.d\.[cm]?ts$/.test(file))
        return text;
    if (/\.[cm]?tsx?$/.test(file)) {
        if (typeof ts.transpileDeclaration !== 'function') {
            projectContract.reason = '提供方 TypeScript 缺少 transpileDeclaration，请安装 TypeScript 5.5 或更新版本，或显式使用 implementation 模式。';
            return text;
        }
        try {
            const result = ts.transpileDeclaration(projectBridgeFactories(file, selectContractTypes(file, text)), { fileName: file, reportDiagnostics: true,
                compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, removeComments: false } });
            if (result.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) {
                projectContract.reason = result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).slice(0,3).map(d => 'TS'+d.code+': '+ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; ');
                return text;
            }
            projectContract.supported = true;
            return normalizeContractDeclaration(file, result.outputText);
        }
        catch {
            return text;
        }
    }
    if (!file.endsWith('.vue') || !parseVue)
        return text;
    try {
        const parsed = parseVue(text);
        if (parsed.errors?.length)
            return text;
        const d = parsed.descriptor;
        const setup = d.scriptSetup;
        if (!setup || setup.lang !== 'ts' || setup.src || setup.attrs.generic || d.script?.src
            || (d.script && d.script.lang !== 'ts') || d.template?.lang || d.template?.src
            || d.customBlocks?.length || d.styles?.some(s => s.module)
            || /<\/?slot\b|\bv-slot\b/.test(d.template?.content || ''))
            return text;
        const read = source => ts.createSourceFile(file + '.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        const main = d.script ? read(d.script.content) : undefined;
        const source = read(setup.content);
        const unsupported = new Set(['defineSlots', 'defineModel']);
        let unsafe = false;
        const scan = node => {
            if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && unsupported.has(node.expression.text))
                unsafe = true;
            if (ts.isIdentifier(node) && ['defineProps', 'defineEmits', 'withDefaults', 'defineOptions', 'defineExpose'].includes(node.text)
                && (ts.isVariableDeclaration(node.parent) || ts.isFunctionDeclaration(node.parent)
                    || ts.isParameter(node.parent) || ts.isImportSpecifier(node.parent)))
                unsafe = true;
            ts.forEachChild(node, scan);
        };
        scan(source);
        if (source.statements.some(s => ts.isModuleDeclaration(s)
            || (s.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
                && !ts.isInterfaceDeclaration(s) && !ts.isTypeAliasDeclaration(s))))
            unsafe = true;
        if (unsafe || source.parseDiagnostics.length || main?.parseDiagnostics.length)
            return text;
        const typeStatement = s => ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)
            || ts.isImportDeclaration(s) || (ts.isExportDeclaration(s) && (s.isTypeOnly
            || (s.exportClause && ts.isNamedExports(s.exportClause) && s.exportClause.elements.every(e => e.isTypeOnly))));
        // 普通 script 的值导出/默认选项可能改变组件公共实例，不猜测其合同。
        if (main?.statements.some(s => !typeStatement(s) && !ts.isEmptyStatement(s)))
            return text;
        const safeDefault = node => {
            if (ts.isStringLiteral(node) || ts.isNumericLiteral(node) || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind))
                return true;
            if (ts.isPrefixUnaryExpression(node))
                return safeDefault(node.operand);
            if (ts.isArrayLiteralExpression(node))
                return node.elements.every(safeDefault);
            if (ts.isObjectLiteralExpression(node))
                return node.properties.every(p => ts.isPropertyAssignment(p)
                    && !ts.isComputedPropertyName(p.name) && safeDefault(p.initializer));
            return ts.isIdentifier(node) && node.text === 'undefined';
        };
        const printer = ts.createPrinter({ removeComments: false });
        const extra = [];
        const allNames = new Set();
        const collectNames = n => { if (ts.isIdentifier(n))
            allNames.add(n.text); ts.forEachChild(n, collectNames); };
        collectNames(source);
        const ownBindings = name => source.statements.flatMap(s => ts.isFunctionDeclaration(s) && s.name?.text === name ? [s]
            : ts.isVariableStatement(s) ? s.declarationList.declarations.filter(v => ts.isIdentifier(v.name) && v.name.text === name) : []);
        // 无值return才可能是void；不能把throw/never或返回数据的方法强行改成void。
        // 除显式bare return外，只接受可证明的落尾路径：无调用的直线体，或any参数的
        // 一层属性等值/真假判断组成、且没有最终else的分支链。其属性都可同时取NaN，
        // 所有等值和真假条件均为false；前缀不得读取/修改该参数或执行未知调用。
        const voidBody = fn => {
            if (!fn.body || !ts.isBlock(fn.body) || fn.asteriskToken)
                return false;
            let bare = false, values = false;
            const returns = n => { if (ts.isFunctionLike(n))
                return; if (ts.isReturnStatement(n)) {
                if (n.expression)
                    values = true;
                else
                    bare = true;
            } ts.forEachChild(n, returns); };
            returns(fn.body);
            if (values)
                return false;
            if (bare)
                return true;
            const anyParams = new Set(fn.parameters.filter(p => ts.isIdentifier(p.name) && p.type?.kind === ts.SyntaxKind.AnyKeyword).map(p => p.name.text));
            const plain = (n, banParams = false) => {
                if (ts.isFunctionLike(n))
                    return true;
                if (ts.isCallExpression(n) || ts.isNewExpression(n) || ts.isAwaitExpression(n) || ts.isTaggedTemplateExpression(n)
                    || ts.isThrowStatement(n) || ts.isReturnStatement(n) || ts.isIterationStatement(n, false) || ts.isSwitchStatement(n) || ts.isTryStatement(n))
                    return false;
                if (banParams && ts.isIdentifier(n) && anyParams.has(n.text))
                    return false;
                let valid = true;
                ts.forEachChild(n, c => { if (!plain(c, banParams))
                    valid = false; });
                return valid;
            };
            const unwrap = n => ts.isParenthesizedExpression(n) ? unwrap(n.expression) : n;
            const leaf = n => { n = unwrap(n); return ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && anyParams.has(n.expression.text); };
            const closed = n => { let valid = true; const visit = c => { if (ts.isIdentifier(c) && anyParams.has(c.text))
                valid = false; ts.forEachChild(c, visit); }; visit(n); return valid && plain(n); };
            const condition = n => {
                n = unwrap(n);
                if (leaf(n))
                    return true;
                if (!ts.isBinaryExpression(n))
                    return false;
                const op = n.operatorToken.kind;
                if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.AmpersandAmpersandToken)
                    return condition(n.left) && condition(n.right);
                return [ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken].includes(op)
                    && ((leaf(n.left) && (leaf(n.right) || closed(n.right))) || (leaf(n.right) && closed(n.left)));
            };
            const tail = n => ts.isIfStatement(n) && condition(n.expression) && (!n.elseStatement || tail(n.elseStatement));
            const statements = [...fn.body.statements];
            const last = statements.pop();
            const prefix = statements.every(s => (ts.isVariableStatement(s) || ts.isExpressionStatement(s) || ts.isEmptyStatement(s)) && plain(s, true));
            if (!last)
                return true;
            return prefix && (tail(last) || ((ts.isVariableStatement(last) || ts.isExpressionStatement(last) || ts.isEmptyStatement(last)) && plain(last)));
        };
        const inferDeclaration = (name, nodes) => {
            if (typeof ts.transpileDeclaration !== 'function')
                return false;
            // 可变值、联合注解、导入值及运行期断言可能在expose处缩窄；不抹掉这些流类型。
            if (nodes.some(node => ts.isVariableDeclaration(node) && (!(node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)))
                || (ts.isFunctionExpression(node.initializer) && node.initializer.name)
                || (node.type && !ts.isFunctionTypeNode(node.type))
                || (node.parent && ts.isVariableDeclarationList(node.parent) && !(node.parent.flags & ts.NodeFlags.Const)))))
                return false;
            let mutated = false;
            const contains = n => { let found = false; const visit = c => { if (ts.isIdentifier(c) && c.text === name)
                found = true; ts.forEachChild(c, visit); }; visit(n); return found; };
            const direct = n => { while (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isTypeAssertionExpression(n) || ts.isNonNullExpression(n))
                n = n.expression; return ts.isIdentifier(n) && n.text === name; };
            const inspect = n => {
                if (ts.isBinaryExpression(n) && ts.isAssignmentOperator(n.operatorToken.kind) && contains(n.left))
                    mutated = true;
                if (ts.isCallExpression(n) && !(ts.isIdentifier(n.expression) && n.expression.text === 'defineExpose') && n.arguments.some(direct))
                    mutated = true;
                ts.forEachChild(n, inspect);
            };
            inspect(source);
            if (mutated)
                return false;
            const snippet = annotate => nodes.map(node => {
                let current = node;
                const fn = ts.isVariableDeclaration(node) ? node.initializer : node;
                if (annotate && fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isFunctionDeclaration(fn)) && !fn.type && voidBody(fn)) {
                    const type = fn.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)
                        ? ts.factory.createTypeReferenceNode(ts.factory.createQualifiedName(ts.factory.createIdentifier('globalThis'), 'Promise'), [ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)])
                        : ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword);
                    let next;
                    if (ts.isArrowFunction(fn))
                        next = ts.factory.updateArrowFunction(fn, fn.modifiers, fn.typeParameters, fn.parameters, type, fn.equalsGreaterThanToken, fn.body);
                    else if (ts.isFunctionExpression(fn))
                        next = ts.factory.updateFunctionExpression(fn, fn.modifiers, fn.asteriskToken, fn.name, fn.typeParameters, fn.parameters, type, fn.body);
                    else
                        next = ts.factory.updateFunctionDeclaration(fn, fn.modifiers, fn.asteriskToken, fn.name, fn.typeParameters, fn.parameters, type, fn.body);
                    current = ts.isVariableDeclaration(node) ? ts.factory.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type, next) : next;
                }
                if (ts.isVariableDeclaration(current))
                    current = ts.factory.createVariableStatement([ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)], ts.factory.createVariableDeclarationList([current], ts.NodeFlags.Const));
                else
                    current = ts.factory.updateFunctionDeclaration(current, [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword), ...(current.modifiers || []).filter(m => m.kind !== ts.SyntaxKind.ExportKeyword)], current.asteriskToken, current.name, current.typeParameters, current.parameters, current.type, current.body);
                return printer.printNode(ts.EmitHint.Unspecified, current, source);
            }).join('\n');
            const run = code => ts.transpileDeclaration(code, { fileName: 'contract.ts', reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, removeComments: false } });
            let result = run(snippet(false));
            if (result.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) {
                if (allNames.has('globalThis'))
                    return false;
                result = run(snippet(true));
            }
            if (result.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error))
                return false;
            const declarations = read(result.outputText);
            const edits = [];
            for (const s of declarations.statements)
                for (const m of s.modifiers || [])
                    if (m.kind === ts.SyntaxKind.ExportKeyword)
                        edits.push({ start: m.getStart(declarations), end: m.end });
            let output = result.outputText;
            for (const edit of edits.sort((a, b) => b.start - a.start))
                output = output.slice(0, edit.start) + output.slice(edit.end);
            extra.push(...read(output).statements);
            return true;
        };
        const exposed = new Set();
        const expose = call => {
            if (call.arguments.length === 0)
                return call;
            if (call.arguments.length !== 1 || !ts.isObjectLiteralExpression(call.arguments[0]))
                return;
            const properties = [];
            for (const p of call.arguments[0].properties) {
                if (ts.isShorthandPropertyAssignment(p)) {
                    const name = p.name.text;
                    if (!exposed.has(name)) {
                        const nodes = ownBindings(name);
                        if (nodes.length) {
                            if (!inferDeclaration(name, nodes))
                                return;
                        }
                        else
                            return;
                        exposed.add(name);
                    }
                    properties.push(p);
                    continue;
                }
                if (!ts.isPropertyAssignment(p) || ts.isComputedPropertyName(p.name))
                    return;
                if (safeDefault(p.initializer)) {
                    properties.push(p);
                    continue;
                }
                if (!(ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer)))
                    return;
                let name = '__fgContractExpose';
                for (let i = 1; allNames.has(name); i++)
                    name = '__fgContractExpose' + i;
                allNames.add(name);
                const node = ts.factory.createVariableDeclaration(name, undefined, undefined, p.initializer);
                if (!inferDeclaration(name, [node]))
                    return;
                properties.push(ts.factory.updatePropertyAssignment(p, p.name, ts.factory.createIdentifier(name)));
            }
            return ts.factory.updateCallExpression(call, call.expression, call.typeArguments, [ts.factory.updateObjectLiteralExpression(call.arguments[0], properties)]);
        };
        const macro = call => {
            if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression))
                return false;
            const name = call.expression.text;
            if (name === 'defineProps')
                return call.typeArguments?.length === 1 && call.arguments.length === 0;
            if (name === 'defineEmits')
                return (call.typeArguments?.length === 1 && call.arguments.length === 0)
                    || (call.arguments.length === 1 && ts.isArrayLiteralExpression(call.arguments[0]) && call.arguments[0].elements.every(e => ts.isStringLiteral(e)));
            if (name === 'defineOptions')
                return call.arguments.length === 1 && ts.isObjectLiteralExpression(call.arguments[0])
                    && call.arguments[0].properties.every(p => ts.isPropertyAssignment(p) && !ts.isComputedPropertyName(p.name)
                        && ((p.name.text === 'name' && ts.isStringLiteral(p.initializer))
                            || (p.name.text === 'inheritAttrs' && [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(p.initializer.kind))));
            if (name === 'defineExpose')
                return call.arguments.length === 0;
            return name === 'withDefaults' && call.arguments.length === 2
                && macro(call.arguments[0]) && call.arguments[0].expression.text === 'defineProps' && safeDefault(call.arguments[1]);
        };
        const keep = [];
        for (const s of source.statements) {
            if (typeStatement(s)) {
                keep.push(s);
                continue;
            }
            if (ts.isExpressionStatement(s) && ts.isCallExpression(s.expression) && ts.isIdentifier(s.expression.expression) && s.expression.expression.text === 'defineExpose') {
                const next = expose(s.expression);
                if (!next)
                    return text;
                keep.push(ts.factory.updateExpressionStatement(s, next));
                continue;
            }
            if (ts.isExpressionStatement(s) && macro(s.expression)) {
                keep.push(s);
                continue;
            }
            if (ts.isVariableStatement(s) && s.declarationList.declarations.length === 1) {
                const v = s.declarationList.declarations[0];
                if (ts.isIdentifier(v.name) && v.initializer && macro(v.initializer))
                    keep.push(s);
            }
        }
        const macroCount = nodes => {
            let count = 0;
            const visit = n => {
                if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)
                    && ['defineProps', 'defineEmits', 'withDefaults', 'defineOptions', 'defineExpose'].includes(n.expression.text))
                    count++;
                ts.forEachChild(n, visit);
            };
            for (const n of nodes)
                visit(n);
            return count;
        };
        // 一个宏不能被投影，整份SFC回退；不能只留下emits却丢掉运行时props/解构默认值。
        if (macroCount(source.statements) !== macroCount(keep))
            return text;
        keep.unshift(...extra);
        // script-setup无宏时默认关闭实例，公共面为空；仍由官方工具生成组件基础签名。
        if (!keep.length)
            keep.push(...read('export {};').statements);
        // 类型依赖仍完整保留；只剔除从未用于合同的值/类型导入。
        const used = new Set();
        const identifiers = node => { if (ts.isIdentifier(node))
            used.add(node.text); ts.forEachChild(node, identifiers); };
        const isType = s => ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s);
        const exported = s => s.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
        for (const s of keep)
            if (!ts.isImportDeclaration(s) && (!isType(s) || exported(s)))
                identifiers(s);
        if (main)
            for (const s of main.statements)
                if (!ts.isImportDeclaration(s))
                    identifiers(s);
        const visited = new Set();
        for (;;) {
            let changed = false;
            for (const s of keep)
                if (isType(s) && used.has(s.name.text) && !visited.has(s)) {
                    visited.add(s);
                    identifiers(s);
                    changed = true;
                }
            if (!changed)
                break;
        }
        for (let i = keep.length - 1; i >= 0; i--)
            if (isType(keep[i]) && !exported(keep[i]) && !used.has(keep[i].name.text))
                keep.splice(i, 1);
        const render = (statements, sf) => statements.map(s => {
            if (!ts.isImportDeclaration(s))
                return printer.printNode(ts.EmitHint.Unspecified, s, s.getSourceFile?.() || sf);
            const clause = s.importClause;
            // 显式副作用导入可能提供全局/模块增强，是合同的一部分，不能因没有绑定名而删除。
            if (!clause)
                return printer.printNode(ts.EmitHint.Unspecified, s, sf);
            const defaultName = clause.name && used.has(clause.name.text) ? clause.name : undefined;
            let bindings = clause.namedBindings;
            if (bindings && ts.isNamedImports(bindings)) {
                const elements = bindings.elements.filter(e => used.has(e.name.text));
                bindings = elements.length ? ts.factory.updateNamedImports(bindings, elements.map(e => ts.factory.updateImportSpecifier(e, false, e.propertyName, e.name))) : undefined;
            }
            else if (bindings && !used.has(bindings.name.text))
                bindings = undefined;
            if (!defaultName && !bindings)
                return '';
            const next = ts.factory.updateImportDeclaration(s, s.modifiers, ts.factory.updateImportClause(clause, true, defaultName, bindings), s.moduleSpecifier, s.attributes);
            return printer.printNode(ts.EmitHint.Unspecified, next, sf);
        }).join('\n');
        const replacements = [{ start: setup.loc.start.offset, end: setup.loc.end.offset, text: render(keep, source).trim() || 'export {};' }];
        if (main)
            replacements.push({ start: d.script.loc.start.offset, end: d.script.loc.end.offset, text: render([...main.statements], main) });
        if (d.template)
            replacements.push({ start: d.template.loc.start.offset, end: d.template.loc.end.offset, text: '' });
        // 非CSS-module样式不属于组件公共类型；其v-bind验证依赖已擦除的实现变量。
        for (const style of d.styles || [])
            replacements.push({ start: style.loc.start.offset, end: style.loc.end.offset, text: '' });
        let result = text;
        for (const edit of replacements.sort((a, b) => b.start - a.start))
            result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
        projectContract.supported = true;
        return result;
    }
    catch {
        return text;
    }
}
`
}

/**
 * 所有编译读取共用的合同边界。失败时返回空输入阻止后续导入扩张，调用方必须
 * 拒绝整批结果；不能让工具继续分析未投影的业务实现，也不能发布残缺声明。
 * 预算涵盖库声明，避免公开合同自己引入的巨型类型图无限扩大。
 */
export function genContractBoundary(): string {
  return String.raw`
function createContractBoundary(project, ambientSources = {}) {
  const errors = new Set();
  const blocked = new Map();
  const files = new Map();
  let bytes = 0, local = 0;
  const reject = (file, reason) => {
    if (errors.size < 5) errors.add('公开合同生成已停止：' + file + '\n原因：' + reason
      + '\n修法：为公开导出补充明确的参数/返回类型；Vue 使用可独立确定的 props、事件和 expose 签名。'
      + '全局类型请通过明确的类型或副作用导入声明。需要完整实现推导时显式设置 dts.devCheck: "implementation"。'
      + '\n本次没有退回完整源码扫描，未发布新的类型资源。');
    return undefined;
  };
  const read = (file, text, probe = false) => {
    if (typeof text !== 'string') return text;
    const source = /\.(?:[cm]?[jt]sx?|vue|json)$/.test(file);
    if (!source || /(?:^|[/\\])package(?:-lock)?\.json$/.test(file)) return text;
    if (errors.size) return undefined;
    if (!files.has(file)) {
      const size = Buffer.byteLength(text);
      files.set(file, size); bytes += size;
      if (!/(?:^|[/\\])node_modules(?:[/\\]|$)/.test(file) && !/\.d\.[cm]?ts$/.test(file)) local++;
      if (files.size > 4096 || local > 512 || size > 4 * 1024 * 1024 || bytes > 32 * 1024 * 1024)
        return reject(file, '超过合同分析预算（总输入4096个、本地源码512个、单文件4MiB、总文本32MiB）；当前输入 '
          + files.size + ' 个，本地 ' + local + ' 个，文本 ' + bytes + ' 字节。请缩小公开类型依赖面。');
    }
    const ambient = ambientSources[file];
    if (ambient) return text === ambient.original ? ambient.text : reject(file, '全局声明在合同准备后发生变化，请等待开发服务重新生成。');
    if (/\.d\.[cm]?ts$/.test(file) || file.endsWith('.json')) return text;
    const next = project(file, text);
    if (!project.supported) {
      const reason = '无法在不分析实现的情况下准确提取此文件的公开合同（复杂推导、未支持的组件语法或工具扩展）。' + (project.reason ? ' ' + project.reason : '');
      if (!probe) return reject(file, reason);
      // 旧Volar以读取snapshot实现fileExists，可能探测最终不被采用的库JS。
      // 空视图保留存在性且绝不展开实现，只有真正进入Program的文件才构成失败。
      blocked.set(file, reason);
      return '';
    }
    return next;
  };
  const validateProgram = sources => {
    let programBytes = 0;
    for (const source of sources) {
      const file = source.fileName.replace(/(\.vue)\.[cm]?[jt]sx?$/, '$1');
      if (blocked.has(file)) reject(file, blocked.get(file));
      programBytes += Buffer.byteLength(source.text || '');
      if (programBytes > 32 * 1024 * 1024) { reject(file, '实际类型程序超过32MiB文本预算（含复用AST），请缩小公开类型依赖。'); break; }
    }
    if (sources.length > 4096) reject('Program', '实际类型程序超过4096文件预算（含复用AST），请缩小公开类型依赖。');
  };
  return {read, errors, reject, validateProgram};
}
`
}

export function createContractBoundary(project: ReturnType<typeof createContractProjection>, ambientSources: Record<string, { original: string; text: string }> = {}): {
  read: (file: string, text: string | undefined, probe?: boolean) => string | undefined
  errors: Set<string>
  validateProgram: (sources: Array<{ fileName: string; text?: string }>) => void
  reject: (file: string, reason: string) => undefined
} {
  return new Function('project', 'ambientSources', `${genContractBoundary()}; return createContractBoundary(project, ambientSources);`)(project, ambientSources)
}

export function createContractProjection(ts: typeof TS, parseVue?: (text: string) => unknown, contractTypeNames: Record<string, string[] | null> = {}): (file: string, text: string | undefined) => string | undefined {
  return new Function('ts', 'parseVue', 'contractTypeNames', `${genContractProjection()}; return projectContract;`)(ts, parseVue, contractTypeNames)
}
