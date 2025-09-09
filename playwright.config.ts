import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60 * 1000, // Increased timeout for E2E tests with mock setup
  expect: {
    timeout: 10 * 1000,
  },
  fullyParallel: false, // Disable parallel execution to avoid port conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 1, // Single worker to avoid conflicts
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list']
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10 * 1000,
    navigationTimeout: 30 * 1000,
  },
  
  // Global setup and teardown
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',

  // Web server configuration for E2E tests
  webServer: {
    command: 'npm run dev:e2e',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    env: {
      NODE_ENV: 'test',
      E2E_TESTING: 'true',
    },
    timeout: 120 * 1000, // 2 minutes for server startup
    stdout: 'pipe',
    stderr: 'pipe',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      teardown: 'cleanup',
    },
    {
      name: 'cleanup', 
      testMatch: /.*\.teardown\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      dependencies: ['setup'],
    },
    // Mobile testing projects for MVP validation
    {
      name: 'mobile-chrome',
      use: { 
        ...devices['Pixel 5'],
        contextOptions: {
          hasTouch: true,
        }
      },
      dependencies: ['setup'],
      testMatch: ['**/mobile-*.spec.ts', '**/seller-listing-creation-mvp.spec.ts', '**/buyer-discovery-bidding-mvp.spec.ts'],
    },
    {
      name: 'mobile-safari',
      use: { 
        ...devices['iPhone 12'],
        contextOptions: {
          hasTouch: true,
        }
      },
      dependencies: ['setup'],
      testMatch: ['**/mobile-*.spec.ts'],
    },
    // MVP-specific test suite projects
    {
      name: 'mvp-core-functionality',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testMatch: ['**/*-mvp.spec.ts'],
    },
    {
      name: 'mvp-performance',
      use: { 
        ...devices['Desktop Chrome'],
        contextOptions: {
          // Enable more aggressive performance monitoring
          recordVideo: { mode: 'on-failure', size: { width: 1280, height: 720 } },
        }
      },
      dependencies: ['setup'],
      testMatch: ['**/production-performance-mvp.spec.ts', '**/integration-suite-mvp.spec.ts'],
    },
  ],
});


