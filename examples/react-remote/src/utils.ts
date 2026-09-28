export function formatMoney(value: number, currency = '¥'): string {
  return `${currency}${value.toFixed(2)}`
}
