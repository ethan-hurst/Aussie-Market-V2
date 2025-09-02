import type { Page, APIRequestContext } from '@playwright/test';

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


