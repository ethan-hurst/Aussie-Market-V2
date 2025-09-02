import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function checkA11y(page, url: string) {
  await page.goto(url);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations, `${url} has a11y violations`).toEqual([]);
}

test('home page a11y', async ({ page }) => {
  await checkA11y(page, '/');
});

test('listing page a11y (stub)', async ({ page }) => {
  const listingId = 'a11y-listing';
  // Stub minimal REST endpoints used by listing page
  await page.route('**/rest/v1/listings*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: listingId, title: 'A11y Listing', description: 'Test', location: { suburb: 'Sydney', state: 'NSW' }, start_cents: 1000, start_at: new Date().toISOString(), end_at: new Date(Date.now()+86400000).toISOString(), seller_id: 's', users: { legal_name: 'Seller' }, created_at: new Date().toISOString() }]) }));
  await page.route('**/rest/v1/auctions*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'a1', current_price_cents: 1200 }]) }));
  await page.route('**/rest/v1/listing_photos*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await checkA11y(page, `/l/${listingId}`);
});

test('order page a11y (stub)', async ({ page }) => {
  const orderId = 'a11y-order';
  await page.route(`**/api/orders/${orderId}`, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: orderId, amount_cents: 1000, state: 'paid', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), listings: { title: 'Order Item', description: 'Desc', listing_photos: [] }, buyer: { id: 'u_buyer', legal_name: 'Buyer', email: 'b@e.com' }, seller: { id: 'u_seller', legal_name: 'Seller', email: 's@e.com' } }) }));
  await page.route(`**/api/shipments/${orderId}/events`, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) }));
  await checkA11y(page, `/orders/${orderId}`);
});


