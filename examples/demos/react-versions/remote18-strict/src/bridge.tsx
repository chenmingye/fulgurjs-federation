/** React 自有 root/context，跨大版本隔离时不传递 ReactElement 或 Context。 */
import React, { createContext, useContext, useEffect, useState } from 'react'
import { version as rendererVersion } from 'react-dom'
import { defineBridgeApp, loadShare, unwrapDefault } from '@fulgurjs/federation/react'

const LocalContext = createContext('未提供')
function Probe({ onReady }: { onReady?: (info: Record<string, unknown>) => void }) {
  const context = useContext(LocalContext)
  const [count, setCount] = useState(0)
  useEffect(() => {
    let active = true
    loadShare('react', { shareScope: 'default', singleton: true, strictVersion: true, requiredVersion: '^18.0.0' })
      .then((value) => { if (active) onReady?.({ version: React.version, rendererVersion, context, react: React, dynamicSame: unwrapDefault(value) === React }) })
      .catch((error) => { if (active) console.error(error) })
    return () => { active = false }
  }, [onReady, context])
  return <section style={{ padding: 12, border: '1px solid #888', margin: 12 }}>
    <p data-testid="child-version">React {React.version} / renderer {rendererVersion}</p>
    <p data-testid="child-context">{context}</p>
    <button data-testid="child-counter" onClick={() => setCount(count + 1)}>子应用计数：{count}</button>
  </section>
}
export default defineBridgeApp((props) => <LocalContext.Provider value="remote18-strict 自有 Context">
  <Probe onReady={props.onReady as ((info: Record<string, unknown>) => void) | undefined} />
</LocalContext.Provider>)
