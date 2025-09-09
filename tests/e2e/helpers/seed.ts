import type { Page, APIRequestContext } from '@playwright/test';
import { request } from '@playwright/test';

export async function seedListing(api: APIRequestContext, sessionUserId: string, overrides: Partial<any> = {}) {
  const payload = {
    title: overrides.title || 'E2E Test Listing',
    description: overrides.description || 'Automated listing for E2E',
    category_id: overrides.category_id || 1,
    condition: overrides.condition || 'good',
    start_cents: overrides.start_cents || 1000,
    reserve_cents: overrides.reserve_cents,
    buy_now_cents: overrides.buy_now_cents,
    pickup: overrides.pickup ?? true,
    shipping: overrides.shipping ?? false,
    location: overrides.location || { street: '1 Test St', suburb: 'Testville', postcode: '2000', state: 'NSW' },
    start_at: overrides.start_at || new Date().toISOString(),
    end_at: overrides.end_at || new Date(Date.now() + 7 * 86400000).toISOString()
  };

  // Simulate authenticated request by setting a cookie/session header if your API checks it via locals.
  // Here we assume the server uses a getSession() off cookies; for tests, you can add a header and read it in hooks if needed.
  const res = await api.post('/api/listings', { data: payload, headers: { 'x-test-user-id': sessionUserId } });
  return res.json();
}

/**
 * Seeds test data for E2E tests
 * Note: The mock system handles webhook simulation and auth mocking.
 * Actual test data is created dynamically by individual tests as needed.
 */
export async function seedTestData(): Promise<void> {
  try {
    // Create API request context
    const apiContext = await request.newContext({
      baseURL: 'http://localhost:5173'
    });

    // Reset mock services to ensure clean state
    await apiContext.post('/api/mock/reset');

    // Verify mock services are healthy
    const healthResponse = await apiContext.get('/api/mock/health');
    const healthData = await healthResponse.json();
    
    if (healthData.overall !== 'healthy') {
      console.warn('⚠️ Mock services are not fully healthy:', healthData);
    } else {
      console.log('✅ Mock services verified healthy');
    }

    await apiContext.dispose();
    console.log('✅ Test data seeded successfully');
  } catch (error) {
    console.error('❌ Failed to seed test data:', error);
    // Don't fail the tests if seeding fails - just log and continue
    // Individual tests will handle their own data setup
  }
}

/**
 * Cleans up test data after E2E tests complete
 */
export async function cleanupTestData(): Promise<void> {
  try {
    // Create API request context
    const apiContext = await request.newContext({
      baseURL: 'http://localhost:5173'
    });

    // Reset all mock services to clean state
    await apiContext.post('/api/mock/reset');

    await apiContext.dispose();
    console.log('✅ Test data cleanup completed');
  } catch (error) {
    console.error('❌ Failed to cleanup test data:', error);
    // Don't fail cleanup - just log the error
  }
}


