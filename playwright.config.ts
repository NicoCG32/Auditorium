import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4178',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: 'pages.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-pages',
      testMatch: 'pages.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:4179',
      },
    },
    {
      name: 'firefox',
      testMatch: ['acceptance.spec.ts', 'integrations.spec.ts'],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testMatch: ['acceptance.spec.ts', 'integrations.spec.ts'],
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: [
    {
      command: 'node e2e/server.mjs',
      url: 'http://127.0.0.1:4178',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'node e2e/server.mjs pages',
      url: 'http://127.0.0.1:4179/Auditorium/',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
