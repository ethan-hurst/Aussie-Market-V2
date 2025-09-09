/**
 * Playwright Global Teardown for E2E Tests
 * Cleans up mock services and test environment after all tests complete
 */

import { chromium, FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('\n🧹 Starting E2E Test Environment Cleanup...\n');

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Check if server is still running
    console.log('🔍 Checking server status...');
    
    try {
      const response = await page.goto('http://localhost:5173/api/mock/health', {
        waitUntil: 'domcontentloaded',
        timeout: 5000
      });

      if (response && response.status() === 200) {
        console.log('✅ Server is still running');

        // Get final mock service status
        const healthData = await response.json();
        console.log('📊 Final mock service status:', healthData.overall);
        
        // Reset mock services one final time
        console.log('🔄 Final mock services reset...');
        
        try {
          await page.evaluate(async () => {
            const response = await fetch('/api/mock/reset', { method: 'POST' });
            if (!response.ok) {
              throw new Error(`Reset failed: ${response.status}`);
            }
            return response.json();
          });
          console.log('✅ Final mock services reset completed');
        } catch (error) {
          console.log('⚠️ Final mock service reset failed:', error);
        }

      } else {
        console.log('ℹ️ Server is not responding (likely already stopped)');
      }
    } catch (error) {
      console.log('ℹ️ Server is not accessible (likely already stopped)');
    }

    // Clean up any test artifacts
    console.log('🗑️ Cleaning up test artifacts...');
    
    // Clear any temporary files or caches if needed
    // This is where you would add cleanup for test databases, files, etc.
    
    console.log('📋 Test session summary:');
    console.log(`   - Configuration: ${config.configFile || 'default'}`);
    console.log(`   - Test directory: ${config.testDir}`);
    console.log(`   - Workers: ${config.workers}`);
    
    console.log('\n✅ E2E Test Environment Cleanup Complete!\n');

  } catch (error) {
    console.error('\n⚠️ E2E Test Environment Cleanup encountered errors:');
    console.error(error);
    // Don't throw here - cleanup errors shouldn't fail the overall test run
  } finally {
    await browser.close();
  }
}

export default globalTeardown;