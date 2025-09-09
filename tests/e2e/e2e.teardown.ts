/**
 * E2E Test Teardown
 * Runs after the main test suite to clean up
 */

import { test as teardown } from '@playwright/test';

teardown('cleanup E2E environment', async ({ page }) => {
  console.log('🧹 Cleaning up E2E test environment...');

  // Final reset of mock services
  try {
    const response = await page.goto('/api/mock/reset', {
      timeout: 5000,
      waitUntil: 'domcontentloaded'
    });
    
    if (response.status() === 200) {
      console.log('✅ Final mock services cleanup completed');
    }
  } catch (error) {
    console.warn('⚠️ Final cleanup failed, but this is not critical:', error);
  }

  console.log('✅ E2E environment cleanup complete');
});