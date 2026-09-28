/** 渲染抛错组件（N05：ErrorBoundary 捕获渲染异常与网络错误分开归因） */
export default function BrokenRender(): never {
  throw new Error('broken-render: 远程组件渲染期故意抛错（fixture 注入）')
}
