/** 纯工具模块：验证非组件 expose 与 default/named 语义 */
export function sum(...nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0)
}

export function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const ANSWER = 42

export default function greet(name: string): string {
  return `Hello from remote-a, ${name}!`
}
