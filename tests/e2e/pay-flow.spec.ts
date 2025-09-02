import { test, expect } from '@playwright/test';
import { stubStripe } from './helpers/stripe';

test('buyer can complete payment with stubbed Stripe and APIs', async ({ page }) => {
  const orderId = 'test-order-id';

  await stubStripe(page);

  // Stub order fetch
  await page.route(`**/api/orders/${orderId}`, async (route) => {
    const body = {
      id: orderId,
      total_amount_cents: 12345,
      listing: { title: 'Test Listing' },
      winning_bid_amount_cents: 11000,
      platform_fee_cents: 345,
      buyer: { legal_name: 'Test Buyer' }
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  // Stub payments endpoints
  await page.route('**/api/payments/create-intent', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clientSecret: 'cs_stub', paymentIntentId: 'pi_stub' }) });
  });
  await page.route('**/api/payments/confirm', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, orderState: 'paid' }) });
  });

  // Intercept final navigation target so route resolves
  await page.route(`**/orders/${orderId}`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Order page</body></html>' });
  });

  await page.goto(`/orders/${orderId}/pay`);
  await expect(page.getByRole('heading', { name: 'Complete Payment' })).toBeVisible();

  const confirmReq = page.waitForRequest('**/api/payments/confirm');
  await page.getByRole('button', { name: /Pay/ }).click();
  await confirmReq;
  await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));
});


