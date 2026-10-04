<template>
  <div class="page">
    <header class="page-header">
      <h1>错误恢复隔离演示（examples/demos/errors）</h1>
      <p class="page-sub">
        remote-good：<a href="http://localhost:5352/err-good/" target="_blank" rel="noreferrer">http://localhost:5352</a>
        · host：本页 http://localhost:5353 · 每张卡一次「注入 → 展示真实错误 → 恢复 → 验证可用」循环；重玩请刷新页面。
      </p>
      <div class="monitor" data-testid="error-monitor">
        <div class="monitor-row">
          <span class="monitor-title">未预期错误监视器</span>
          <span :class="['monitor-count', monitor.unexpected.length > 0 ? 'bad' : 'ok']" data-testid="monitor-unexpected-count">
            {{ monitor.unexpected.length }}
          </span>
          <span class="monitor-desc">条（window.onerror + unhandledrejection + 非 fulgurjs 前缀 console.error）</span>
          <span class="monitor-desc">
            预期故障登记（fulgurjs:error 事件与 [fulgurjs 前缀诊断，不计入未预期）：
            <strong data-testid="monitor-expected-count">{{ monitor.expected.length }}</strong> 条
          </span>
        </div>
        <ul v-if="monitor.unexpected.length > 0" class="monitor-list" data-testid="monitor-unexpected-list">
          <li v-for="item in monitor.unexpected.slice(-5)" :key="item.id">
            [{{ item.at }} {{ item.channel }}] {{ item.text }}
          </li>
        </ul>
        <details :open="monitor.expected.length > 0 && monitor.expected.length <= 6">
          <summary>预期故障登记明细（{{ monitor.expected.length }}）</summary>
          <ul class="monitor-list">
            <li v-for="item in monitor.expected.slice(-8)" :key="item.id">[{{ item.at }} {{ item.channel }}] {{ item.text }}</li>
          </ul>
        </details>
      </div>
    </header>

    <main class="cards">
      <Card1Unreachable />
      <Card2MissingModule />
      <Card3Timeout />
      <Card4ModuleError />
      <Card5StrictVersion />
      <Card6BridgeBroken />
      <Card7BridgeMountFail />
      <Card8BridgeUnmountFail />
      <Card9SetupFail />
      <Card10Normal />
    </main>

    <footer class="page-footer">
      <p>
        隔离约定：每个故障远程独立命名（err-unreachable / err-hang / err-setup-bad），桥接卡各用独立 expose；
        卡 3 的挂起连接与卡 9 的 setup 生命周期均为一次性注入（重玩请刷新页面）。
        预期 console 噪声清单见 examples/demos/errors/README.md。
      </p>
    </footer>
  </div>
</template>

<script setup lang="ts">
/**
 * err-host 单页应用：顶部「故障选择器」为 10 张故障卡，页面级「未预期错误监视器」
 * 常驻页首。卡片顺序即 README 操作步骤顺序；每卡独立容器/独立远程名，互不依赖。
 */
import Card1Unreachable from './cards/Card1Unreachable.vue'
import Card2MissingModule from './cards/Card2MissingModule.vue'
import Card3Timeout from './cards/Card3Timeout.vue'
import Card4ModuleError from './cards/Card4ModuleError.vue'
import Card5StrictVersion from './cards/Card5StrictVersion.vue'
import Card6BridgeBroken from './cards/Card6BridgeBroken.vue'
import Card7BridgeMountFail from './cards/Card7BridgeMountFail.vue'
import Card8BridgeUnmountFail from './cards/Card8BridgeUnmountFail.vue'
import Card9SetupFail from './cards/Card9SetupFail.vue'
import Card10Normal from './cards/Card10Normal.vue'
import { monitor } from './error-monitor'
</script>

<style>
/* 全局演示样式：卡片、舞台、结果区为各卡共用，放在非 scoped 块 */
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: #f5f6f8;
  color: #262626;
  font-family: 'PingFang SC', 'Helvetica Neue', Arial, sans-serif;
}
.page {
  max-width: 1080px;
  margin: 0 auto;
  padding: 16px 16px 48px;
}
.page-header h1 {
  margin: 0 0 6px;
  font-size: 22px;
}
.page-sub {
  margin: 0 0 10px;
  color: #666;
  font-size: 13px;
}
.monitor {
  border: 1px solid #d9d9d9;
  background: #fff;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
}
.monitor-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.monitor-title {
  font-weight: 700;
}
.monitor-count {
  font-size: 18px;
  font-weight: 700;
  min-width: 24px;
  text-align: center;
  border-radius: 6px;
  padding: 0 6px;
}
.monitor-count.bad {
  color: #fff;
  background: #cf1322;
}
.monitor-count.ok {
  color: #fff;
  background: #389e0d;
}
.monitor-desc {
  color: #888;
}
.monitor-list {
  margin: 8px 0 0;
  padding-left: 18px;
  color: #a8071a;
  font-size: 12px;
  word-break: break-all;
}
.cards {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 14px;
}
.card {
  border: 1px solid #d9d9d9;
  background: #fff;
  border-radius: 8px;
  padding: 12px 14px;
}
.card-head {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.card-title {
  margin: 0;
  font-size: 16px;
}
.code-chip {
  background: #f0f5ff;
  border: 1px solid #adc6ff;
  color: #1d39c4;
  border-radius: 10px;
  padding: 1px 10px;
  font-size: 12px;
}
.card-principle {
  margin: 8px 0;
  color: #555;
  font-size: 13px;
  line-height: 1.7;
}
.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.card-actions button {
  padding: 6px 14px;
  border: 1px solid #1677ff;
  border-radius: 6px;
  background: #1677ff;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
}
.card-actions button:disabled {
  border-color: #d9d9d9;
  background: #f5f5f5;
  color: #bbb;
  cursor: not-allowed;
}
.card-stage,
.card-result {
  margin-top: 8px;
}
.stage-box {
  border: 1px dashed #bfbfbf;
  border-radius: 6px;
  padding: 8px;
  min-height: 40px;
  background: #fafafa;
}
.stage-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.stage-label {
  margin: 0 0 6px;
  font-size: 12px;
  color: #888;
}
.stage-note {
  margin: 6px 0;
  color: #666;
  font-size: 12px;
  line-height: 1.8;
}
.dom-check {
  margin: 6px 0 0;
  color: #1d39c4;
  font-size: 12px;
  word-break: break-all;
}
.success {
  margin: 8px 0 0;
  color: #389e0d;
  font-weight: 600;
  font-size: 13px;
}
.page-footer {
  margin-top: 20px;
  color: #999;
  font-size: 12px;
  line-height: 1.8;
}
code {
  background: #f5f5f5;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
  word-break: break-all;
}
a {
  color: #1677ff;
}
</style>
