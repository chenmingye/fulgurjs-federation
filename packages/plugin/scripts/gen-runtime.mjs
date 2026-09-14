import fs from 'node:fs'
const code = fs.readFileSync('dist/runtime.js', 'utf8')
fs.writeFileSync('src/runtime-code.gen.ts', 'export default ' + JSON.stringify(code) + ';\n')
console.log('runtime-code.gen.ts written')
