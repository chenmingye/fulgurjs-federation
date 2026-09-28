/** 参数页：宿主路由的 params/query 以 props 传入（id 必填） */
export default function Detail({ id, tab }: { id: string; tab?: string }) {
  return (
    <section>
      <h2>remote-react / Detail</h2>
      <p>id: {id}</p>
      <p>tab: {tab ?? '(none)'}</p>
    </section>
  )
}
