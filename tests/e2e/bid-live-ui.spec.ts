import { test, expect } from '@playwright/test';

test('LiveAuction/BidForm validates and updates price on bid', async ({ page }) => {
  const listingId = 'live-bid-1';
  const auction = { id: 'a1', current_price_cents: 1200, bid_count: 1, high_bid_id: null, reserve_met: false };
  const listing: any = {
    id: listingId,
    title: 'Live Bid Listing',
    description: 'Live auction bid test',
    location: { suburb: 'Sydney', state: 'NSW' },
    start_cents: 1000,
    reserve_cents: 2000,
    start_at: new Date().toISOString(),
    end_at: new Date(Date.now() + 86400000).toISOString(),
    seller_id: 'seller1',
    users: { legal_name: 'Seller' },
    created_at: new Date().toISOString()
  };
  const photos: any[] = [];

  // Stub Supabase REST endpoints consumed by listing page
  await page.route('**/rest/v1/listings*', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([listing]) });
  });
  await page.route('**/rest/v1/auctions*', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([auction]) });
  });
  await page.route('**/rest/v1/listing_photos*', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(photos) });
  });

  let lastBidCents = auction.current_price_cents;
  await page.route('**/api/bids', async (route) => {
    const body = await route.request().postDataJSON().catch(() => ({}));
    if (body?.amount_cents) {
      lastBidCents = body.amount_cents;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, bid: { id: 'b1', amount_cents: lastBidCents } }) });
    }
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Bad bid' }) });
  });

  await page.goto(`/l/${listingId}`);

  // Check initial display
  await expect(page.getByText('$12.00')).toBeVisible();
  await expect(page.getByText('Minimum Next Bid')).toBeVisible();

  // Enter a value below minimum and verify validation text appears (Minimum bid ...)
  const bidInput = page.getByPlaceholder('Enter your bid amount').first();
  await bidInput.fill('12.10');
  await expect(page.getByText(/Minimum bid/i)).toBeVisible();

  // Now enter a valid amount and place bid
  await bidInput.fill('13.00');
  // Attempt to click the Place Bid button (from BidForm)
  const placeBtn = page.getByRole('button', { name: /Place Bid/i });
  await placeBtn.click();

  // After bid, either UI updates live or on reload; ensure updated price visible
  await page.reload();
  await expect(page.getByText('$13.00')).toBeVisible();
});


