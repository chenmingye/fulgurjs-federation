/** 门户交互：拉取场景与探活状态，支持单场景启动/停止。 */

const el = (sel) => document.querySelector(sel)
let registryVersion = ''

async function refresh() {
  const data = await fetch('/api/scenarios').then((r) => r.json())
  el('#meta').textContent = `registry latest: @fulgurjs/federation@${registryVersion} · ${data.filter((s) => s.ready).length}/${data.filter((s) => s.apps.length).length} 场景就绪 · 自动刷新 30s`
  renderColumns(data)
  renderCards(data)
}

function renderColumns(data) {
  const seen = new Set()
  el('#columns').innerHTML = data
    .filter((s) => !seen.has(s.column) && seen.add(s.column))
    .map((s) => `<a href="#sc-${s.id}">${s.column}</a>`)
    .join('')
}

function appRow(a) {
  return `<div class="app">
    <span class="dot ${a.up ? 'up' : ''}" title="${a.up ? '运行中' : '未启动'}"></span>
    <a href="${a.url}" target="_blank" rel="noreferrer">${a.url}</a>
    <span class="muted">${a.name}</span>
    <span class="badge">${a.role} · ${a.framework} · :${a.port}</span>
  </div>`
}

function renderCards(data) {
  el('#scenarios').innerHTML = data
    .map(
      (s) => `<section class="card" id="sc-${s.id}">
      <h2>${s.title} <span class="muted" style="font-size:12px">${s.column}</span></h2>
      <p class="desc">${s.desc}</p>
      <div class="apps">${s.apps.length ? s.apps.map(appRow).join('') : '<p class="muted">由其他场景共同覆盖（无独立应用）。</p>'}</div>
      <p class="source">源码：${s.source}</p>
      ${s.apps.length ? `<div class="card-actions">
        <button data-act="start" data-id="${s.id}">启动</button>
        <button class="ghost" data-act="stop" data-id="${s.id}">停止</button>
        ${s.ready === true ? '<span class="status-ok">● 就绪</span>' : s.ready === false ? '<span class="status-bad">● 未全部就绪</span>' : ''}
      </div>` : ''}
    </section>`,
    )
    .join('')
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]')
  if (!btn) return
  btn.disabled = true
  const original = btn.textContent
  btn.textContent = btn.dataset.act === 'start' ? '启动中…' : '停止中…'
  try {
    const response = await fetch(`/api/${btn.dataset.act}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scenario: btn.dataset.id }),
    })
    const result = await response.json()
    if (!response.ok) {
      const message = result.error ?? result.results?.filter((app) => app.error).map((app) => `${app.name}: ${app.error}`).join('；') ?? '操作失败'
      throw new Error(message)
    }
    btn.closest('.card').querySelector('.operation-result')?.remove()
  } catch (error) {
    const card = btn.closest('.card')
    let message = card.querySelector('.operation-result')
    if (!message) {
      message = document.createElement('p')
      message.className = 'operation-result status-bad'
      message.setAttribute('role', 'alert')
      card.append(message)
    }
    message.textContent = error.message
  } finally {
    btn.textContent = original
    btn.disabled = false
    const errorMessage = btn.closest('.card')?.querySelector('.operation-result')?.textContent
    const cardId = btn.dataset.id
    await refresh()
    if (errorMessage) {
      const message = document.createElement('p')
      message.className = 'operation-result status-bad'
      message.setAttribute('role', 'alert')
      message.textContent = errorMessage
      document.getElementById(`sc-${cardId}`)?.append(message)
    }
  }
})

el('#btn-refresh').addEventListener('click', refresh)

try {
  registryVersion = JSON.parse(
    await fetch('https://registry.npmjs.org/@fulgurjs/federation/latest').then((r) => r.text()),
  ).version
} catch { registryVersion = '(无法访问 registry)' }

await refresh()
setInterval(refresh, 30000)
