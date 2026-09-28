/** 参数页：宿主路由 params/query 透传为 props（id 必填验证 R03） */
export default function Detail({ id, tab }: { id: string; tab?: string }) {
  return (
    <div data-testid="remote-detail">
      <h2>remote-react / Detail</h2>
      <p data-testid="detail-id">id:{id}</p>
      <p data-testid="detail-tab">tab:{tab ?? '(none)'}</p>
    </div>
  )
}
