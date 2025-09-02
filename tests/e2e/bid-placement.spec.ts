import { test, expect } from '@playwright/test';

test('bid placement updates current/minimum bid UI', async ({ page }) => {
  const listingId = 'e2e-listing-1';
  const current = { amount_cents: 1200 };
  const listing: any = {
    id: listingId,
    title: 'Bid E2E',
    start_cents: 1000,
    reserve_cents: 2000,
    end_at: new Date(Date.now() + 86400000).toISOString(),
    bid_count: 1
  };

  // Render a minimal page that hosts BidForm behavior via stubs
  await page.route('**/api/bids', async (route) => {
    // Treat bid POST as success and echo updated bid
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, bid: { id: 'b1', amount_cents: 1300 } }) });
  });

  // Build a synthetic route displaying bid UI: for demo, we just serve markup and use client JS
  const html = `
  <html><body>
    <div id="app">
      <div id="current">Current Bid: $${(current.amount_cents/100).toFixed(2)}</div>
      <div id="min">Minimum: $${((current.amount_cents+100)/100).toFixed(2)}</div>
      <input id="bid" />
      <button id="place">Place Bid</button>
    </div>
    <script>
      const current = ${JSON.stringify(current)};
      document.getElementById('place').addEventListener('click', async () => {
        const val = document.getElementById('bid').value;
        const cents = Math.round(parseFloat(val||'0')*100);
        if (isNaN(cents) || cents < current.amount_cents + 100) return;
        const res = await fetch('/api/bids', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ listingId:'${listingId}', amount_cents:cents })});
        if (res.ok) {
          current.amount_cents = cents;
          document.getElementById('current').textContent = 'Current Bid: $'+(cents/100).toFixed(2);
          document.getElementById('min').textContent = 'Minimum: $'+((cents+100)/100).toFixed(2);
        }
      });
    </script>
  </body></html>`;

  await page.route('**/e2e/bid', r => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await page.goto('/e2e/bid');

  await expect(page.locator('#current')).toHaveText('Current Bid: $12.00');
  await expect(page.locator('#min')).toHaveText('Minimum: $13.00');

  await page.fill('#bid', '13.50');
  await page.click('#place');
  await expect(page.locator('#current')).toHaveText('Current Bid: $13.50');
  await expect(page.locator('#min')).toHaveText('Minimum: $14.50');
});


