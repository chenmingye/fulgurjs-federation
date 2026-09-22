import { defineConfig, devices } from '@playwright/test'

// dev server 的输出通道：CI 下必须与步骤 stdout 解耦——Playwright 收尾若未能杀净 dev server 的
// 孙进程（pnpm → sh → vite → esbuild 的进程树），残留进程会占住 step 的 stdout 管道，
// 使步骤永不结束（2026-09-22 实测：测试 12/12 全过后步骤空转 19 分钟被 timeout 取消）。
// 本地保留 pipe 以便排障（本地 shell 不受此影响）。
const serverStdio = process.env.CI ? ('ignore' as const) : ('pipe' as const)

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../docs/playwright-report' }]],
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    launchOptions: {
      // fixtures 全部走 localhost，禁用系统代理避免环境干扰
      args: ['--no-proxy-server'],
    },
  },
  // dev server 三件套（已起则复用）；prod 套件用 SKIP_DEV_SERVERS=1 跳过
  webServer: process.env.SKIP_DEV_SERVERS
    ? undefined
    : [
        {
          command: 'pnpm dev',
          cwd: '../fixtures/remote-a',
          url: 'http://localhost:5101/@fulgurjs-manifest.json',
          reuseExistingServer: true,
          stdout: serverStdio,
          stderr: serverStdio,
          timeout: 90_000,
        },
        {
          command: 'pnpm dev',
          cwd: '../fixtures/remote-b',
          url: 'http://localhost:5102/@fulgurjs-manifest.json',
          reuseExistingServer: true,
          stdout: serverStdio,
          stderr: serverStdio,
          timeout: 90_000,
        },
        {
          command: 'pnpm dev',
          cwd: '../fixtures/host-vue',
          url: 'http://localhost:5100',
          reuseExistingServer: true,
          stdout: serverStdio,
          stderr: serverStdio,
          timeout: 90_000,
        },
      ],
  projects: [
    {
      name: 'dev',
      testMatch: /dev\.spec\.ts/,
      use: { baseURL: 'http://localhost:5100' },
    },
    {
      name: 'fault',
      testMatch: /fault\.spec\.ts/,
      use: { baseURL: 'http://localhost:5100' },
    },
    {
      name: 'prod',
      testMatch: /prod\.spec\.ts/,
      use: { baseURL: 'http://localhost:8999' },
    },
  ],
  outputDir: './artifacts',
})
