#!/usr/bin/env node

/**
 * Sentry Integration Validation Script
 * Runs comprehensive validation of Sentry setup across all application layers
 */

import { validateSentryIntegration } from '../src/lib/sentry-validation.ts';

async function main() {
  console.log('🚀 Starting Sentry Integration Validation...\n');
  
  try {
    const results = await validateSentryIntegration();
    
    const failedTests = results.filter(r => !r.success);
    
    if (failedTests.length === 0) {
      console.log('\n🎉 All Sentry integration tests passed!');
      process.exit(0);
    } else {
      console.log(`\n⚠️  ${failedTests.length} test(s) failed. Please review the errors above.`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Validation script failed:', error);
    process.exit(1);
  }
}

main();
