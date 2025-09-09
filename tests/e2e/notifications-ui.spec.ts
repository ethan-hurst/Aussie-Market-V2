import { test, expect } from '@playwright/test';

test('notifications bell shows unread badge and mark-as-read clears it', async ({ page }) => {
  // Listen to console logs from the page
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  const testUserId = '11111111-1111-1111-1111-111111111111';
  
  // Stub session for layout to consider user logged in
  await page.addInitScript(() => {
    console.log('Test: Setting up session in localStorage');
    localStorage.setItem('sb-session', JSON.stringify({ access_token: 't', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: '11111111-1111-1111-1111-111111111111' } }));
  });

  // Mock server handles notification endpoints directly
  await page.setExtraHTTPHeaders({ 'x-test-user-id': testUserId });
  await page.addInitScript(() => {
    localStorage.setItem('sb-session', JSON.stringify({ access_token: 't', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: testUserId } }));
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


