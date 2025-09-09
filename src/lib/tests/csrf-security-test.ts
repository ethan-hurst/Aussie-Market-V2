/**
 * CSRF Protection and API Security Test Suite
 * 
 * This test suite validates that our CSRF protection and security middleware
 * correctly blocks malicious requests and allows legitimate ones.
 */

import { validateCsrfToken, type CsrfValidationResult } from '$lib/security';
import { validateQueryParams, validateWithSecurity, BidsQuerySchema } from '$lib/validation';

interface TestRequest {
  method: string;
  url: URL;
  headers: Record<string, string>;
}

interface TestCase {
  name: string;
  request: TestRequest;
  expectedResult: 'pass' | 'fail';
  description: string;
}

/**
 * Create a mock request event for testing
 */
function createMockRequest(method: string, url: string, headers: Record<string, string> = {}): { request: Request; url: URL } {
  const urlObj = new URL(url);
  const request = new Request(urlObj.toString(), {
    method,
    headers: new Headers(headers)
  });
  
  return { request, url: urlObj };
}

/**
 * CSRF Protection Test Cases
 */
const csrfTestCases: TestCase[] = [
  // ========== LEGITIMATE REQUESTS (SHOULD PASS) ==========
  {
    name: 'Legitimate POST with correct Origin',
    request: {
      method: 'POST',
      url: new URL('https://aussiemarket.com/api/bids'),
      headers: {
        'origin': 'https://aussiemarket.com',
        'content-type': 'application/json'
      }
    },
    expectedResult: 'pass',
    description: 'POST request from same origin should be allowed'
  },
  
  {
    name: 'Legitimate PUT with correct Referer',
    request: {
      method: 'PUT', 
      url: new URL('https://aussiemarket.com/api/listings'),
      headers: {
        'referer': 'https://aussiemarket.com/dashboard',
        'content-type': 'application/json'
      }
    },
    expectedResult: 'pass',
    description: 'PUT request with matching referer should be allowed'
  },

  {
    name: 'GET request (safe method)',
    request: {
      method: 'GET',
      url: new URL('https://aussiemarket.com/api/listings?action=search'),
      headers: {}
    },
    expectedResult: 'pass',
    description: 'GET requests should always be allowed'
  },

  {
    name: 'Test environment bypass',
    request: {
      method: 'POST',
      url: new URL('https://aussiemarket.com/api/bids'),
      headers: {
        'x-test-user-id': 'test-user-123',
        'content-type': 'application/json'
      }
    },
    expectedResult: 'pass',
    description: 'Test requests should be allowed to bypass CSRF'
  },

  // ========== MALICIOUS REQUESTS (SHOULD FAIL) ==========
  {
    name: 'Cross-site POST attack',
    request: {
      method: 'POST',
      url: new URL('https://aussiemarket.com/api/bids'),
      headers: {
        'origin': 'https://evil-site.com',
        'content-type': 'application/json'
      }
    },
    expectedResult: 'fail',
    description: 'POST from different origin should be blocked'
  },

  {
    name: 'Missing Origin and Referer headers',
    request: {
      method: 'DELETE',
      url: new URL('https://aussiemarket.com/api/listings/123'),
      headers: {
        'content-type': 'application/json'
      }
    },
    expectedResult: 'fail',
    description: 'State-changing request without Origin/Referer should be blocked'
  },

  {
    name: 'Malformed Referer header',
    request: {
      method: 'POST',
      url: new URL('https://aussiemarket.com/api/orders/123'),
      headers: {
        'referer': 'not-a-valid-url',
        'content-type': 'application/json'
      }
    },
    expectedResult: 'fail',
    description: 'Malformed referer should be blocked'
  },

  {
    name: 'Cross-site with malicious referer',
    request: {
      method: 'PUT',
      url: new URL('https://aussiemarket.com/api/payments/confirm'),
      headers: {
        'referer': 'https://attacker.com/fake-page',
        'content-type': 'application/json'
      }
    },
    expectedResult: 'fail',
    description: 'Referer from different domain should be blocked'
  },

  {
    name: 'Suspicious User-Agent',
    request: {
      method: 'POST',
      url: new URL('https://aussiemarket.com/api/bids'),
      headers: {
        'origin': 'https://aussiemarket.com',
        'user-agent': 'python-requests/2.28.0',
        'content-type': 'application/json'
      }
    },
    expectedResult: 'pass', // Should pass but log warning
    description: 'Suspicious User-Agent should pass but be logged'
  },

  {
    name: 'Invalid content type',
    request: {
      method: 'POST',
      url: new URL('https://aussiemarket.com/api/bids'),
      headers: {
        'origin': 'https://aussiemarket.com',
        'content-type': 'text/html'
      }
    },
    expectedResult: 'fail',
    description: 'Invalid content type should be blocked'
  }
];

/**
 * Query Parameter Validation Test Cases
 */
const queryValidationTestCases = [
  {
    name: 'Valid bids query - current action',
    params: { action: 'current', listingId: '550e8400-e29b-41d4-a716-446655440000' },
    schema: BidsQuerySchema,
    expectedResult: 'pass',
    description: 'Valid UUID and action should pass'
  },
  
  {
    name: 'Invalid UUID format',
    params: { action: 'current', listingId: 'not-a-uuid' },
    schema: BidsQuerySchema,
    expectedResult: 'fail',
    description: 'Invalid UUID should be rejected'
  },
  
  {
    name: 'Missing required parameters',
    params: { action: 'current' }, // missing listingId
    schema: BidsQuerySchema,
    expectedResult: 'fail',
    description: 'Missing required listingId should be rejected'
  },
  
  {
    name: 'Limit parameter validation',
    params: { action: 'history', listingId: '550e8400-e29b-41d4-a716-446655440000', limit: '150' },
    schema: BidsQuerySchema,
    expectedResult: 'fail',
    description: 'Limit over 100 should be rejected'
  },
  
  {
    name: 'XSS attempt in action parameter',
    params: { action: '<script>alert("xss")</script>' },
    schema: BidsQuerySchema,
    expectedResult: 'fail',
    description: 'XSS attempts should be rejected'
  }
];

/**
 * Run CSRF protection tests
 */
export async function runCsrfTests(): Promise<{ passed: number; failed: number; results: any[] }> {
  const results: any[] = [];
  let passed = 0;
  let failed = 0;

  console.log('🔒 Running CSRF Protection Tests...\n');

  for (const testCase of csrfTestCases) {
    try {
      const mockEvent = createMockRequest(
        testCase.request.method,
        testCase.request.url.toString(),
        testCase.request.headers
      );

      const result: CsrfValidationResult = validateCsrfToken(mockEvent);
      
      const actualResult = result.valid ? 'pass' : 'fail';
      const success = actualResult === testCase.expectedResult;

      if (success) {
        passed++;
        console.log(`✅ ${testCase.name}`);
      } else {
        failed++;
        console.log(`❌ ${testCase.name}`);
        console.log(`   Expected: ${testCase.expectedResult}, Got: ${actualResult}`);
        console.log(`   Reason: ${result.reason || 'No reason provided'}`);
      }

      results.push({
        name: testCase.name,
        description: testCase.description,
        expected: testCase.expectedResult,
        actual: actualResult,
        success,
        reason: result.reason,
        headers: result.headers
      });

    } catch (error) {
      failed++;
      console.log(`❌ ${testCase.name} - ERROR: ${error}`);
      
      results.push({
        name: testCase.name,
        description: testCase.description,
        expected: testCase.expectedResult,
        actual: 'error',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return { passed, failed, results };
}

/**
 * Run query parameter validation tests
 */
export async function runQueryValidationTests(): Promise<{ passed: number; failed: number; results: any[] }> {
  const results: any[] = [];
  let passed = 0;
  let failed = 0;

  console.log('\n📊 Running Query Parameter Validation Tests...\n');

  for (const testCase of queryValidationTestCases) {
    try {
      const result = validateWithSecurity(
        testCase.schema,
        testCase.params,
        { endpoint: '/api/test', ip: '127.0.0.1' }
      );
      
      const actualResult = result.ok ? 'pass' : 'fail';
      const success = actualResult === testCase.expectedResult;

      if (success) {
        passed++;
        console.log(`✅ ${testCase.name}`);
      } else {
        failed++;
        console.log(`❌ ${testCase.name}`);
        console.log(`   Expected: ${testCase.expectedResult}, Got: ${actualResult}`);
        if (!result.ok) {
          console.log(`   Error: ${result.error}`);
        }
      }

      results.push({
        name: testCase.name,
        description: testCase.description,
        expected: testCase.expectedResult,
        actual: actualResult,
        success,
        error: result.ok ? null : result.error,
        value: result.ok ? result.value : null
      });

    } catch (error) {
      failed++;
      console.log(`❌ ${testCase.name} - ERROR: ${error}`);
      
      results.push({
        name: testCase.name,
        description: testCase.description,
        expected: testCase.expectedResult,
        actual: 'error',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return { passed, failed, results };
}

/**
 * Run all security tests
 */
export async function runAllSecurityTests(): Promise<void> {
  console.log('🚨 CSRF Protection & API Security Test Suite\n');
  console.log('Testing comprehensive security measures...\n');

  const csrfResults = await runCsrfTests();
  const queryResults = await runQueryValidationTests();

  console.log('\n📋 TEST SUMMARY');
  console.log('===============');
  console.log(`CSRF Protection Tests: ${csrfResults.passed}/${csrfResults.passed + csrfResults.failed} passed`);
  console.log(`Query Validation Tests: ${queryResults.passed}/${queryResults.passed + queryResults.failed} passed`);
  
  const totalPassed = csrfResults.passed + queryResults.passed;
  const totalTests = csrfResults.passed + csrfResults.failed + queryResults.passed + queryResults.failed;
  
  console.log(`\nOVERALL: ${totalPassed}/${totalTests} tests passed`);
  
  if (csrfResults.failed > 0 || queryResults.failed > 0) {
    console.log('\n⚠️  Some tests failed. Review the security implementation.');
    console.log('Security vulnerabilities detected in the system.');
  } else {
    console.log('\n✅ All security tests passed!');
    console.log('CSRF protection and input validation are working correctly.');
  }
}

// Export test results for external testing frameworks
export { csrfTestCases, queryValidationTestCases };