<template>
  <div style="font-family: sans-serif; padding: 16px; max-width: 860px">
    <h1>vue-host（fulgurjs 联邦宿主）</h1>
    <nav style="display: flex; gap: 16px; margin-bottom: 16px">
      <RouterLink to="/">首页</RouterLink>
      <RouterLink to="/remote/home">远程首页</RouterLink>
      <RouterLink to="/remote/detail/7?tab=basic">远程详情（id=7）</RouterLink>
      <RouterLink to="/utils-demo">TS 模块调用</RouterLink>
    </nav>
    <RouterView />
  </div>
</template>
