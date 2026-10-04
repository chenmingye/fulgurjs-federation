<template>
  <div class="page">
    <h1>err-good（错误恢复演示远程）</h1>
    <p>
      本工程是 <code>examples/demos/errors</code> 场景的「正常远程」：所有 expose 都可正常加载，
      故障由宿主侧注入或由专门的故障注入 expose 提供。请打开宿主
      <code>http://localhost:5353/</code> 进行故障注入与恢复操作。
    </p>
    <h2>exposes 清单</h2>
    <ul>
      <li><code>./ClickButton</code> — 正常按钮组件（恢复目标的验证组件）</li>
      <li><code>./utils</code> — 工具函数模块（sumNumbers / formatPrice / DEMO_ANSWER）</li>
      <li><code>./module-error</code> — 模块顶层 throw 故障注入（卡 4）</li>
      <li><code>./bridge-good</code> — 合法桥接契约（卡 6/7/8 恢复目标）</li>
      <li><code>./bridge-broken</code> — 契约非法注入，默认导出缺 mount/unmount（卡 6 → MFU-015）</li>
      <li><code>./bridge-mount-fail</code> — mount 阶段抛错注入（卡 7 → MFU-016 phase:mount）</li>
      <li><code>./bridge-unmount-fail</code> — unmount 阶段抛错注入（卡 8 → MFU-016 phase:unmount + 容器封锁）</li>
    </ul>
    <h2>setup 生命周期</h2>
    <p>
      <code>federation({ setup: './src/fulgurjs/setup.ts' })</code>：
      宿主首次 <code>loadRemote('err-good/…')</code> 时自动执行（应用级一次）；
      当 <code>globalThis.__FGX_FAIL_SETUP__ === true</code> 时同步抛错（卡 9 → MFU-012）。
    </p>
  </div>
</template>

<style scoped>
.page {
  font-family: sans-serif;
  padding: 16px;
  max-width: 760px;
  line-height: 1.7;
}
code {
  background: #f5f5f5;
  padding: 1px 5px;
  border-radius: 3px;
}
</style>
