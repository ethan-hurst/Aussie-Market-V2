import type { Page } from '@playwright/test';

export async function stubStripe(page: Page) {
  await page.route('https://js.stripe.com/v3', async (route) => {
    const body = `window.Stripe = function(){return {elements(){return {create(){return {mount(){}}}}}, confirmCardPayment: async function(){return {paymentIntent:{id:'pi_stub'}}}}}`;
    await route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  await page.route('**/api/payments/create-intent', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clientSecret: 'cs_stub', paymentIntentId: 'pi_stub' }) });
  });
  await page.route('**/api/payments/confirm', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, orderState: 'paid' }) });
  });
}


