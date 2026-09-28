import { createElement } from 'react'
import { createRoot } from 'react-dom/client'

createRoot(document.getElementById('root')!).render(
  createElement('p', null, 'react-remote 独立运行（联邦消费请从 react-host 访问）'),
)
