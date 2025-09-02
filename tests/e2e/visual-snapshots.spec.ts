import { test, expect } from '@playwright/test';

const enableVisual = !!process.env.E2E_VISUAL;

test.skip(!enableVisual, 'Visual snapshots are disabled by default. Set E2E_VISUAL=1 to enable locally.');

test('home hero visual snapshots across breakpoints', async ({ page }) => {
  await page.goto('/');
  // Desktop
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page).toHaveScreenshot('home-hero-desktop.png');
  // Tablet
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page).toHaveScreenshot('home-hero-tablet.png');
  // Mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page).toHaveScreenshot('home-hero-mobile.png');
});

test('listing card visual snapshot (stub)', async ({ page }) => {
  const listingId = 'snap-listing-1';
  await page.route('**/rest/v1/listings*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: listingId, title: 'Snapshot Listing', description: 'Desc', location: { suburb: 'Sydney', state: 'NSW' }, start_cents: 1000, start_at: new Date().toISOString(), end_at: new Date(Date.now()+86400000).toISOString(), seller_id: 's', users: { legal_name: 'Seller' }, created_at: new Date().toISOString() }]) }));
  await page.route('**/rest/v1/auctions*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'a1', current_price_cents: 1200 }]) }));
  await page.route('**/rest/v1/listing_photos*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.goto(`/l/${listingId}`);
  await page.setViewportSize({ width: 1280, height: 1000 });
  const card = page.locator('.card').first();
  await expect(card).toHaveScreenshot('listing-card-desktop.png');
});

test('order timeline visual snapshot (stub)', async ({ page }) => {
  const orderId = 'snap-order-1';
  await page.route(`**/api/orders/${orderId}`, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: orderId, amount_cents: 1500, state: 'shipped', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), listings: { title: 'Snap Order', description: 'Desc', listing_photos: [] }, buyer: { id: 'u_buyer', legal_name: 'Buyer', email: 'b@e.com' }, seller: { id: 'u_seller', legal_name: 'Seller', email: 's@e.com' } }) }));
  await page.route(`**/api/shipments/${orderId}/events`, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [{ id: 'e1', status: 'in_transit', event_time: new Date().toISOString() }] }) }));
  await page.goto(`/orders/${orderId}`);
  await page.setViewportSize({ width: 1280, height: 1000 });
  const timeline = page.getByText('Order Timeline').locator('xpath=..');
  await expect(timeline).toHaveScreenshot('order-timeline-desktop.png');
});


