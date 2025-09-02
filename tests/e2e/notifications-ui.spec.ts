import { test, expect } from '@playwright/test';

test('notifications bell shows unread badge and mark-as-read clears it', async ({ page }) => {
  // Stub session for layout to consider user logged in
  await page.addInitScript(() => {
    localStorage.setItem('sb-session', JSON.stringify({ access_token: 't', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: 'u1' } }));
  });

  // Stub notifications endpoints used by NotificationBell
  let unread = 2;
  await page.route('**/rest/v1/notifications*', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (method === 'GET') {
      const head = url.searchParams.get('head');
      if (head === 'true') {
        // count query
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Content-Range': `0-0/${unread}` }, body: '' });
      }
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

  await page.goto('/');
  // Badge visible with count
  await expect(page.getByLabel('Notifications').locator('xpath=..').locator('text=/\d+/')).toBeVisible();

  // Open dropdown and mark all read
  await page.getByLabel('Notifications').click();
  await page.getByText('Mark all read').click();

  // Badge should disappear after reload
  await page.reload();
  await expect(page.getByLabel('Notifications').locator('xpath=..').locator('text=/\d+/')).toHaveCount(0);
});


