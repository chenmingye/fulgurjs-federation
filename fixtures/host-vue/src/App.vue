<template>
  <div>
    <h1>FULGURJS HOST</h1>
    <nav style="margin-bottom: 8px">
      <a href="#/" data-testid="nav-home">home</a> |
      <a href="#/utils" data-testid="nav-utils">utils</a> |
      <a href="#/multi" data-testid="nav-multi">multi</a> |
      <a href="#/scope" data-testid="nav-scope">scope</a> |
      <a href="#/error" data-testid="nav-error">error</a> |
      <a href="#/rename" data-testid="nav-rename">rename</a> |
      <a href="#/promise-remote" data-testid="nav-promise">promise</a> |
      <a href="#/shared-state" data-testid="nav-shared">shared-state</a>
    </nav>
    <router-view v-slot="{ Component }">
      <suspense>
        <component :is="Component" />
      </suspense>
    </router-view>
  </div>
</template>
