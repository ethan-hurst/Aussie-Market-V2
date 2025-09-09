/**
 * Playwright Global Setup for E2E Tests
 * Sets up mock services and validates the test environment before running tests
 */

import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('\n🚀 Starting E2E Test Environment Setup...\n');

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Wait for server to be ready
    console.log('⏳ Waiting for dev server to start...');
    
    let retries = 30; // 30 attempts with 2-second intervals = 60 seconds max
    let serverReady = false;

    while (retries > 0 && !serverReady) {
      try {
        const response = await page.goto('http://localhost:5173/', { 
          waitUntil: 'domcontentloaded',
          timeout: 5000 
        });
        
        if (response && response.status() < 400) {
          serverReady = true;
          console.log('✅ Dev server is ready');
        }
      } catch (error) {
        retries--;
        if (retries > 0) {
          console.log(`⏳ Server not ready, retrying... (${retries} attempts left)`);
          await page.waitForTimeout(2000);
        }
      }
    }

    if (!serverReady) {
      throw new Error('Dev server failed to start within timeout period');
    }

    // Check mock services health
    console.log('🔍 Checking mock services health...');
    
    try {
      const healthResponse = await page.goto('http://localhost:5173/api/mock/health', {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });

      if (healthResponse && healthResponse.status() === 200) {
        const healthData = await healthResponse.json();
        console.log('✅ Mock services are healthy:', healthData.overall);
        
        // Log service details for debugging
        for (const service of healthData.services) {
          console.log(`   - ${service.service}: ${service.status}`);
        }
      } else {
        console.log('⚠️ Mock services health check failed, but continuing...');
      }
    } catch (error) {
      console.log('⚠️ Could not check mock services health, but continuing...', error);
    }

    // Reset mock services to ensure clean state
    console.log('🔄 Resetting mock services...');
    
    try {
      await page.evaluate(async () => {
        const response = await fetch('/api/mock/reset', { method: 'POST' });
        if (!response.ok) {
          throw new Error(`Reset failed: ${response.status}`);
        }
        return response.json();
      });
      console.log('✅ Mock services reset successfully');
    } catch (error) {
      console.log('⚠️ Mock service reset failed:', error);
    }

    // Validate critical environment variables
    console.log('🔍 Validating E2E environment...');
    
    const requiredEnvVars = [
      'E2E_TESTING',
      'NODE_ENV'
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        console.log(`⚠️ Missing environment variable: ${envVar}`);
      } else {
        console.log(`✅ ${envVar}: ${process.env[envVar]}`);
      }
    }

    // Test basic page functionality
    console.log('🧪 Testing basic page functionality...');
    
    try {
      await page.goto('http://localhost:5173/');
      await page.waitForSelector('body', { timeout: 10000 });
      
      // Check if the page has basic content
      const title = await page.title();
      console.log(`✅ Page loaded successfully. Title: "${title}"`);
      
    } catch (error) {
      console.log('⚠️ Basic page test failed:', error);
    }

    console.log('\n✅ E2E Test Environment Setup Complete!\n');

  } catch (error) {
    console.error('\n❌ E2E Test Environment Setup Failed:');
    console.error(error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;