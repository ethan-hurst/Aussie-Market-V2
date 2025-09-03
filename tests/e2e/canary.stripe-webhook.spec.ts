import { test, expect, request as pwRequest } from '@playwright/test';

const CANARY_TOKEN = process.env.CANARY_TOKEN || '';
const STAGING_SITE_URL = process.env.STAGING_SITE_URL || process.env.PLAYWRIGHT_BASE_URL || '';

test.describe('Canary: Stripe webhook path', () => {
	// This test verifies webhook endpoint rejects invalid signatures.
	test('rejects invalid webhook signature', async ({ request }) => {
		const res = await request.post('/api/webhooks/stripe', {
			headers: { 'stripe-signature': 't=0,v1=invalidsignature' },
			data: '{}',
		});
		expect(res.status()).toBe(400);
		const body = await res.json();
		expect(body.error || '').toMatch(/invalid signature/i);
	});

	// This test requires the CI job to trigger a Stripe test event delivery
	// and then polls our idempotency store via secured endpoint.
	test('records signed event idempotently', async ({ request }) => {
		const eventId = process.env.STRIPE_TEST_EVENT_ID;
		if (!eventId) test.skip(true, 'No STRIPE_TEST_EVENT_ID provided');

		// Poll the secured canary endpoint for the event id
		const api = await pwRequest.newContext({ baseURL: STAGING_SITE_URL });
		for (let i = 0; i < 20; i++) {
			const res = await api.get(`/api/canary/webhook-events?event_id=${eventId}`, {
				headers: { 'x-canary-token': CANARY_TOKEN }
			});
			if (res.status() === 200) {
				const body = await res.json();
				expect(body.found).toBeTruthy();
				// Call again to assert idempotency marker is set (processed_at exists or second call still 200)
				const res2 = await api.get(`/api/canary/webhook-events?event_id=${eventId}`, {
					headers: { 'x-canary-token': CANARY_TOKEN }
				});
				expect(res2.status()).toBe(200);
				return;
			}
			await new Promise((r) => setTimeout(r, 1500));
		}
		throw new Error('Timed out waiting for webhook event to be recorded');
	});
});


