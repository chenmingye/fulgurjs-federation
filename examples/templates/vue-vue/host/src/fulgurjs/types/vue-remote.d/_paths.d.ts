// 精确轨启用方法（把下面片段合入宿主 tsconfig 的 compilerOptions；baseUrl 指向本 tsconfig 所在目录）：
//   "paths": { "vue-remote/*": ["src/fulgurjs/types/vue-remote.d/*"] }
// 说明：零配置轨（vue-remote.d.ts 的 ambient 声明）可解析但导出为宽松类型；
// 配置 paths 后同形态导入解析到本目录的转发模块，获得远程源码级类型精度。
