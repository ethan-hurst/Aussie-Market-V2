import { test, expect } from '@playwright/test';

test('realtime order update refreshes UI when channel event fires', async ({ page }) => {
  // Listen to console logs from the page
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  const orderId = 'rt-order-1';
  const buyerId = '11111111-1111-1111-1111-111111111111';
  const sellerId = '22222222-2222-2222-2222-222222222222';
  const currentOrder: any = {
    id: orderId,
    amount_cents: 1000,
    buyer_id: buyerId,
    seller_id: sellerId,
    state: 'paid',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    listings: { title: 'RT Order', description: 'Realtime test', listing_photos: [] },
    buyer: { id: buyerId, legal_name: 'Buyer', email: 'b@e.com' },
    seller: { id: sellerId, legal_name: 'Seller', email: 's@e.com' }
  };

  // Stub initial fetch
  await page.route(`**/api/orders/${orderId}`, async (route) => {
    // Always return currentOrder snapshot
    console.log('API call to /api/orders/' + orderId + ', returning state:', currentOrder.state);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentOrder) });
  });
  await page.route(`**/api/shipments/${orderId}/events`, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) }));

  // Inject a test channel override that gives us a handle to trigger the callback
  await page.addInitScript(() => {
    (window as any).__TEST_CHANNEL_LISTENERS__ = {};
    (window as any).__TEST_OVERRIDE_SUPABASE_CHANNEL = (name: string) => {
      console.log('Creating test channel for:', name);
      const listeners: any[] = [];
      const channelObj = {
        on: (_evt: any, _filter: any, cb: any) => { 
          console.log('Registering listener for event:', _evt);
          listeners.push(cb); 
          return channelObj; // Return the channel object for method chaining
        },
        subscribe: () => ({ unsubscribe(){} }),
        __fire: async () => { 
          console.log('Firing event to', listeners.length, 'listeners');
          for (const cb of listeners) {
            console.log('Calling callback...');
            try {
              await cb({}); // Await the async callback
            } catch (error) {
              console.error('Error in callback:', error);
            }
          }
        }
      };
      return channelObj;
    };
  });

  await page.setExtraHTTPHeaders({ 'x-test-user-id': buyerId });
  await page.addInitScript(() => {
    localStorage.setItem('sb-session', JSON.stringify({ access_token: 't', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: buyerId } }));
  });
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByRole('heading', { name: /Order #/ })).toBeVisible();
  await expect(page.locator('span.inline-block', { hasText: 'Payment Received' }).first()).toBeVisible();

  // Update in-memory order state to reflect delivery after realtime event
  currentOrder.state = 'delivered';

  // Allow subscribe to attach; verify latest channel is present
  await page.waitForFunction(() => Boolean((window as any).__LATEST_SUPABASE_CHANNEL__), undefined, { timeout: 2000 });
  
  // Fire the realtime event and wait for the callback to process
  await page.evaluate(async () => {
    const ch = (window as any).__LATEST_SUPABASE_CHANNEL__;
    console.log('Channel object:', ch);
    if (ch && ch.__fire) {
      console.log('Firing realtime event...');
      await ch.__fire();
    } else {
      console.log('No channel or __fire method available');
    }
  });

  // Wait for the refetch to happen - we should see another API call
  await page.waitForResponse('**/api/orders/rt-order-1', { timeout: 5000 });

  // Expect UI to reflect new state after handler refetches
  await expect(page.locator('span.inline-block', { hasText: 'Delivered' }).first()).toBeVisible();
});


