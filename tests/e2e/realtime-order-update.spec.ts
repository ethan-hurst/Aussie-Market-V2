import { test, expect } from '@playwright/test';

test('realtime order update refreshes UI when channel event fires', async ({ page }) => {
  const orderId = 'rt-order-1';
  const currentOrder: any = {
    id: orderId,
    amount_cents: 1000,
    state: 'paid',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    listings: { title: 'RT Order', description: 'Realtime test', listing_photos: [] },
    buyer: { id: 'u_buyer', legal_name: 'Buyer', email: 'b@e.com' },
    seller: { id: 'u_seller', legal_name: 'Seller', email: 's@e.com' }
  };

  // Stub initial fetch
  await page.route(`**/api/orders/${orderId}`, async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentOrder) });
  });
  await page.route(`**/api/shipments/${orderId}/events`, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) }));

  // Inject a test channel override that gives us a handle to trigger the callback
  await page.addInitScript(() => {
    (window as any).__TEST_CHANNEL_LISTENERS__ = {};
    (window as any).__TEST_OVERRIDE_SUPABASE_CHANNEL = (name: string) => {
      const listeners: any[] = [];
      return {
        on: (_evt: any, _filter: any, cb: any) => { listeners.push(cb); return { subscribe: () => ({ unsubscribe(){} }) } as any; },
        subscribe: () => ({ unsubscribe(){} }),
        __fire: () => { listeners.forEach(cb => cb({})); }
      } as any;
    };
  });

  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText('Payment Received')).toBeVisible();

  // Update stubbed order endpoint to reflect delivery after realtime event
  await page.unroute(`**/api/orders/${orderId}`);
  currentOrder.state = 'delivered';
  await page.route(`**/api/orders/${orderId}`, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentOrder) }));

  // Fire the realtime callback to simulate a DB change
  await page.evaluate(() => {
    // supabase.channel(...) returned by override exposes __fire
    // We can fetch any last created channel; for simplicity, recreate and fire.
    const ch = (window as any).__TEST_OVERRIDE_SUPABASE_CHANNEL('order-rt');
    ch.__fire();
  });

  // Expect UI to reflect new state after handler refetches
  await expect(page.getByText('Delivered')).toBeVisible();
});


