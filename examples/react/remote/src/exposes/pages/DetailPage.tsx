/** 联邦参数页：宿主路由的 params + query 作为 props 传入 */
export default function DetailPage({ id, tab }: { id?: string; tab?: string }) {
  return (
    <div data-testid="demo-remote-detail">
      <h3>react-remote / 详情页</h3>
      <p data-testid="demo-detail-id">路由参数 id：{id ?? '(无)'}</p>
      <p data-testid="demo-detail-tab">query 参数 tab：{tab ?? '(无)'}</p>
    </div>
  )
}
