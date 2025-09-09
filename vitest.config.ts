import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['src/**/*.spec.ts', 'tests/integration/**/*.spec.ts'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    exclude: ['tests/e2e/**', 'playwright.config.ts', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      include: [
        'src/lib/errorNotificationSystem.ts',
        'src/lib/errors.ts',
        'src/lib/components/ErrorNotificationDisplay.svelte',
        'src/lib/components/ErrorBoundary.svelte',
        'src/lib/components/MetricCard.svelte',
        'src/lib/components/MetricCardFallback.svelte'
      ],
      lines: 80,
      functions: 80,
      branches: 70,
      statements: 80,
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80
      }
    },
    testTimeout: 10000,
    hookTimeout: 5000
  }
});


