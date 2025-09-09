/**
 * E2E Test Setup
 * Runs before the main test suite to prepare the environment
 */

import { test as setup, expect } from '@playwright/test';

setup('prepare E2E environment', async ({ page }) => {
  console.log('🔧 Preparing E2E test environment...');

  // Verify the server is accessible
  await page.goto('/');
  await expect(page).toHaveTitle(/Aussie Market|Home/i);

  // Verify mock services are responding
  try {
    const response = await page.goto('/api/mock/health');
    await expect(response.status()).toBe(200);
    
    const healthData = await response.json();
    expect(healthData.overall).toBe('healthy');
    
    console.log('✅ Mock services verified as healthy');
  } catch (error) {
    console.warn('⚠️ Mock services health check failed, but continuing:', error);
  }

  // Reset mock data to ensure clean state
  try {
    const resetResponse = await page.goto('/api/mock/reset', {
      timeout: 10000,
      waitUntil: 'domcontentloaded'
    });
    
    // The response might be a redirect or might not be JSON, so handle gracefully
    if (resetResponse.status() === 200) {
      console.log('✅ Mock services reset successfully');
    }
  } catch (error) {
    console.warn('⚠️ Mock services reset failed, but continuing:', error);
  }

  console.log('✅ E2E environment preparation complete');
});