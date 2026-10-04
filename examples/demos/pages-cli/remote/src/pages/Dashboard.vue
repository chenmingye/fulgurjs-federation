<template>
  <section class="pc-page">
    <h2>数据看板 <small>pc-remote/pages/dashboard · keepAlive: true（宿主保活白名单）</small></h2>

    <p>
      本页在宿主页面表里声明 keepAlive: true，宿主用 hostPages.keepAliveNames 绑定
      &lt;KeepAlive :include&gt;——切走再回来，下面的计数与输入原样保留（deactivate/activate，不重新挂载）。
    </p>

    <div class="pc-row">
      <button type="button" @click="count += 1">计数 +1</button>
      <span>当前计数：<strong>{{ count }}</strong></span>
    </div>
    <div class="pc-row">
      <input v-model="note" type="text" placeholder="输入一些内容，切走再回来看保活效果" />
    </div>

    <dl class="pc-kv">
      <dt>当前 sessionKey（getAppContext 宽松读取）</dt>
      <dd><code>{{ sessionKey ?? '（空）' }}</code></dd>
    </dl>

    <p class="pc-hint">
      宿主切换会话（新 sessionKey）后，createHostPages 的组件缓存按代次重建——下一次渲染本页会重新走
      beforeLoad → loadRemote，触发远程 onSession 重跑（AppContext 面板的 __PC_SETUP_LOG__ 计数可观察）。
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getAppContext } from '@fulgurjs/federation/runtime'
import { pushRemoteTrace } from '../fulgurjs/trace'

const count = ref(0)
const note = ref('')
const sessionKey = computed(() => getAppContext().sessionKey)

onMounted(() => {
  pushRemoteTrace('远程页面 mounted：pc-remote/pages/dashboard（keepAlive 页首次挂载）')
})
</script>
