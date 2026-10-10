import { loadRemote } from '@fulgurjs/federation/runtime'
import { remoteComponent } from '@fulgurjs/federation/vue'

// 打开此文件体验远程类型提示。此函数不被调用，错误示例不会进入页面执行。
// 下方的错误预期指令表示下一行必须被 TypeScript 拒绝；若不再报错，typecheck 会失败。
export async function checkRemoteTypes(): Promise<void> {
  const utils = await loadRemote('vue-remote/utils')
  // 在 utils. 后触发补全，或悬停查看参数和返回值；无需手写远程接口。
  const total: number = utils.sumNumbers(2, 3, 7)
  const price: string = utils.formatPrice(12.5)
  void [total, price]

  // @ts-expect-error sumNumbers 只接受数字。
  utils.sumNumbers('2', 3)
  // @ts-expect-error formatPrice 返回字符串。
  const wrongPrice: number = utils.formatPrice(12.5)
  void wrongPrice
  // @ts-expect-error 远程没有导出 missingMethod。
  utils.missingMethod()
  // @ts-expect-error 注册表中没有这个入口（故意拼错）。
  await loadRemote('vue-remote/utlis')

  const RemoteDetail = remoteComponent('vue-remote/pages/DetailPage')
  type DetailProps = InstanceType<typeof RemoteDetail>['$props']
  const validProps: DetailProps = { id: '7', tab: 'basic' }
  // @ts-expect-error 远程详情页的 id 是字符串。
  const invalidProps: DetailProps = { id: 7 }
  void [validProps, invalidProps]
}
