import { test, expect } from '@playwright/test';

test('notifications bell shows unread badge and mark-as-read clears it', async ({ page }) => {
  // Stub session for layout to consider user logged in
  await page.addInitScript(() => {
    localStorage.setItem('sb-session', JSON.stringify({ access_token: 't', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: 'u1' } }));
  });

  // Stub notifications endpoints used by NotificationBell
  let unread = 2;
  await page.route('**/rest/v1/notifications*', async (route) => {
    const req = route.request();
    const method = req.method();
    const headers = req.headers();
    const prefer = (headers['prefer'] || headers['Prefer'] || '').toString();
    if (method === 'HEAD' || prefer.includes('count=exact')) {
      // count query (HEAD or GET with Prefer: count=exact)
      return route.fulfill({ status: 200, headers: { 'Content-Range': `0-0/${unread}` } as any, body: '' });
    }
    if (method === 'GET') {
      // list notifications
      const list = [
        { id: 'n1', user_id: 'u1', type: 'order_paid', title: 'Payment Received', message: 'Payment completed', read: unread === 0, created_at: new Date().toISOString() },
        { id: 'n2', user_id: 'u1', type: 'order_shipped', title: 'Item Shipped', message: 'Your item shipped', read: unread < 2, created_at: new Date().toISOString() }
      ];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) });
    }
    if (method === 'PATCH' || method === 'POST') {
      // mark read
      unread = 0;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    }
    return route.continue();
  });
  await page.setExtraHTTPHeaders({ 'x-test-user-id': 'u1' });
  await page.addInitScript(() => {
    localStorage.setItem('sb-session', JSON.stringify({ access_token: 't', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: 'u1' } }));
  });
  // Use a protected route so SSR session is required and user nav renders
  await page.goto('/orders/buyer');
  // Ensure count request was issued before asserting badge
  await page.waitForRequest((req) => req.url().includes('/rest/v1/notifications') && (req.method() === 'HEAD' || ((req.headers()['prefer'] || req.headers()['Prefer'] || '').toString().includes('count=exact'))));
  await expect(page.getByLabel('Notifications')).toBeVisible();
  // Badge visible with count
  await expect(page.getByLabel('Notifications').locator('span').filter({ hasText: /\d+/ })).toBeVisible();

  // Open dropdown and mark all read
  await page.getByLabel('Notifications').click();
  await page.getByText('Mark all read').click();

  // Badge should disappear after reload
  await page.reload();
  await expect(page.getByLabel('Notifications').locator('span').filter({ hasText: /\d+/ })).toHaveCount(0);
});


