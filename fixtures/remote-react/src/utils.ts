export function formatMoney(value: number, currency = '¥'): string {
  return `${currency}${value.toFixed(2)}`
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
