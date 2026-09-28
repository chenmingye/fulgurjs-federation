import { useEffect, useState } from 'react'

export default function Home() {
  const [now, setNow] = useState('')
  useEffect(() => {
    setNow(new Date().toISOString().slice(0, 19))
  }, [])
  return (
    <section>
      <h2>remote-react / Home</h2>
      <p>mounted at {now}</p>
    </section>
  )
}
