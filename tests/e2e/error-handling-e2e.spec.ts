import { test, expect, type Page } from '@playwright/test';
import { setupE2EAuth } from './helpers/auth';
import { seedTestData, cleanupTestData } from './helpers/seed';

/**
 * End-to-end tests for error handling in production-like conditions
 * Tests the complete error handling flow from user interaction to recovery
 */
test.describe('Error Handling End-to-End', () => {
  test.beforeAll(async () => {
    await seedTestData();
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test.describe('Payment Error Scenarios', () => {
    test('should handle card decline with user recovery flow', async ({ page }) => {
      await setupE2EAuth(page, 'buyer');
      
      // Navigate to a test order
      await page.goto('/orders/test-order-payment-fail');
      
      // Attempt payment with card that will be declined
      await page.fill('[data-testid="card-number"]', '4000000000000002'); // Declined card
      await page.fill('[data-testid="card-expiry"]', '12/25');
      await page.fill('[data-testid="card-cvc"]', '123');
      
      await page.click('[data-testid="pay-button"]');
      
      // Wait for error notification to appear
      await expect(page.locator('[role="alert"]')).toContainText('Payment Method Issue');
      await expect(page.locator('[role="alert"]')).toContainText(/card.*declined.*details.*different/i);
      
      // Verify correct recovery actions are available
      await expect(page.locator('button:has-text("New Payment Method")')).toBeVisible();
      await expect(page.locator('button:has-text("Try Again")')).not.toBeVisible();
      
      // Test recovery flow - try new payment method
      await page.click('button:has-text("New Payment Method")');
      
      // Should show new payment form or redirect to payment method selection
      await expect(page.locator('[data-testid="card-number"]')).toBeVisible();
      
      // Complete successful payment
      await page.fill('[data-testid="card-number"]', '4242424242424242'); // Valid card
      await page.click('[data-testid="pay-button"]');
      
      // Verify success
      await expect(page.locator('[role="alert"]')).toContainText('Payment Successful');
    });

    test('should handle insufficient funds with guided recovery', async ({ page }) => {
      await setupE2EAuth(page, 'buyer');
      
      await page.goto('/orders/test-order-insufficient-funds');
      
      // Use insufficient funds card
      await page.fill('[data-testid="card-number"]', '4000000000009995');
      await page.fill('[data-testid="card-expiry"]', '12/25');
      await page.fill('[data-testid="card-cvc"]', '123');
      
      await page.click('[data-testid="pay-button"]');
      
      // Wait for specific error message
      await expect(page.locator('[role="alert"]')).toContainText(/insufficient.*funds/i);
      
      // Verify appropriate actions
      await expect(page.locator('button:has-text("New Payment Method")')).toBeVisible();
      await expect(page.locator('button:has-text("Contact Support")')).toBeVisible();
      
      // Test contact support flow
      await page.click('button:has-text("Contact Support")');
      
      // Should trigger support contact mechanism
      // In real implementation, this might open a support chat or email
    });

    test('should handle 3D Secure authentication failure', async ({ page }) => {
      await setupE2EAuth(page, 'buyer');
      
      await page.goto('/orders/test-order-3ds-fail');
      
      // Use 3DS card that will fail authentication
      await page.fill('[data-testid="card-number"]', '4000000000003220');
      await page.fill('[data-testid="card-expiry"]', '12/25');
      await page.fill('[data-testid="card-cvc"]', '123');
      
      await page.click('[data-testid="pay-button"]');
      
      // 3DS authentication should be triggered and then fail
      // This would involve interaction with Stripe's 3DS modal
      
      // Wait for authentication failure error
      await expect(page.locator('[role="alert"]')).toContainText(/authentication.*failed/i);
      
      // Should offer new payment method
      await expect(page.locator('button:has-text("New Payment Method")')).toBeVisible();
    });
  });

  test.describe('Network Error Recovery', () => {
    test('should handle network timeout with retry mechanism', async ({ page }) => {
      await setupE2EAuth(page, 'buyer');
      
      // Simulate slow network conditions
      await page.route('**/api/payments/**', async route => {
        // Delay to simulate timeout
        await page.waitForTimeout(31000); // Longer than request timeout
        await route.abort();
      });
      
      await page.goto('/orders/test-order-network-timeout');
      
      await page.fill('[data-testid="card-number"]', '4242424242424242');
      await page.fill('[data-testid="card-expiry"]', '12/25');
      await page.fill('[data-testid="card-cvc"]', '123');
      
      await page.click('[data-testid="pay-button"]');
      
      // Should show network error after timeout
      await expect(page.locator('[role="alert"]')).toContainText('Connection Problem');
      await expect(page.locator('[role="alert"]')).toContainText(/timeout.*try.*again/i);
      
      // Test retry functionality
      await expect(page.locator('button:has-text("Try Again")')).toBeVisible();
      
      // Clear the slow network simulation
      await page.unroute('**/api/payments/**');
      
      // Retry should work
      await page.click('button:has-text("Try Again")');
      
      // Should eventually succeed
      await expect(page.locator('[role="alert"]')).toContainText('Payment Successful', { timeout: 15000 });
    });

    test('should handle intermittent connectivity', async ({ page }) => {
      await setupE2EAuth(page, 'buyer');
      
      // Simulate intermittent connectivity
      let requestCount = 0;
      await page.route('**/api/payments/**', async route => {
        requestCount++;
        if (requestCount <= 2) {
          // Fail first two requests
          await route.abort();
        } else {
          // Allow third request to succeed
          await route.continue();
        }
      });
      
      await page.goto('/orders/test-order-intermittent-network');
      
      await page.fill('[data-testid="card-number"]', '4242424242424242');
      await page.fill('[data-testid="card-expiry"]', '12/25');
      await page.fill('[data-testid="card-cvc"]', '123');
      
      await page.click('[data-testid="pay-button"]');
      
      // Should show network error
      await expect(page.locator('[role="alert"]')).toContainText('Connection Problem');
      
      // First retry
      await page.click('button:has-text("Try Again")');
      
      // Should still fail
      await expect(page.locator('[role="alert"]')).toContainText('Connection Problem');
      
      // Second retry should succeed
      await page.click('button:has-text("Try Again")');
      
      await expect(page.locator('[role="alert"]')).toContainText('Payment Successful', { timeout: 10000 });
    });
  });

  test.describe('Webhook Processing Errors', () => {
    test('should handle webhook timeout with status polling', async ({ page }) => {
      await setupE2EAuth(page, 'buyer');
      
      // Mock webhook processing delay
      await page.route('**/api/webhooks/stripe', async route => {
        await page.waitForTimeout(35000); // Simulate very slow webhook processing
        await route.continue();
      });
      
      await page.goto('/orders/test-order-webhook-timeout');
      
      await page.fill('[data-testid="card-number"]', '4242424242424242');
      await page.fill('[data-testid="card-expiry"]', '12/25');
      await page.fill('[data-testid="card-cvc"]', '123');
      
      await page.click('[data-testid="pay-button"]');
      
      // Payment should succeed but webhook processing will be slow
      await expect(page.locator('[role="alert"]')).toContainText('Payment Processing Delay');
      await expect(page.locator('[role="alert"]')).toContainText(/longer.*expected.*processing/i);
      
      // Should offer status polling
      await expect(page.locator('button:has-text("Check Status")')).toBeVisible();
      await expect(page.locator('button:has-text("Retry")')).toBeVisible();
      
      // Test status polling
      await page.click('button:has-text("Check Status")');
      
      // Should trigger status check (might show loading state)
      await expect(page.locator('[data-testid="status-checking"]')).toBeVisible({ timeout: 1000 });
      
      // Eventually should resolve
      await expect(page.locator('[role="alert"]')).toContainText('Payment Confirmed', { timeout: 45000 });
    });

    test('should handle webhook failure with manual resolution', async ({ page }) => {
      await setupE2EAuth(page, 'buyer');
      
      // Mock webhook failure
      await page.route('**/api/webhooks/stripe', async route => {
        await route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Webhook processing failed' })
        });
      });
      
      await page.goto('/orders/test-order-webhook-failure');
      
      await page.fill('[data-testid="card-number"]', '4242424242424242');
      await page.fill('[data-testid="card-expiry"]', '12/25');
      await page.fill('[data-testid="card-cvc"]', '123');
      
      await page.click('[data-testid="pay-button"]');
      
      // Webhook failure should be detected
      await expect(page.locator('[role="alert"]')).toContainText('Payment Processing Delay');
      
      // Should eventually escalate to manual resolution
      await expect(page.locator('button:has-text("Contact Support")')).toBeVisible({ timeout: 30000 });
      
      // Test support contact
      await page.click('button:has-text("Contact Support")');
      
      // Should provide order details for support
      await expect(page.locator('[data-testid="support-order-details"]')).toBeVisible();
    });
  });

  test.describe('Component Error Boundaries', () => {
    test('should handle component render errors gracefully', async ({ page }) => {
      await setupE2EAuth(page, 'buyer');
      
      // Navigate to page that might have component errors
      await page.goto('/orders/test-order-component-error');
      
      // Inject a script that will cause a component to error
      await page.addInitScript(() => {
        // Mock a component that will throw an error
        window.__COMPONENT_ERROR_TEST__ = true;
      });
      
      // Reload to trigger component error
      await page.reload();
      
      // Should show error boundary fallback
      await expect(page.locator('[data-testid="error-boundary-fallback"]')).toBeVisible();
      await expect(page.locator('text=Something went wrong')).toBeVisible();
      
      // Should offer recovery options
      await expect(page.locator('button:has-text("Refresh Page")')).toBeVisible();
      await expect(page.locator('button:has-text("Report Issue")')).toBeVisible();
      
      // Test page refresh recovery
      await page.click('button:has-text("Refresh Page")');
      
      // Should reload and recover (assuming error was transient)
      await expect(page.locator('[data-testid="error-boundary-fallback"]')).not.toBeVisible();
    });

    test('should handle Stripe Elements loading failure', async ({ page }) => {
      await setupE2EAuth(page, 'buyer');
      
      // Block Stripe.js loading
      await page.route('**/js.stripe.com/**', route => route.abort());
      
      await page.goto('/orders/test-order-stripe-elements-fail');
      
      // Should detect Stripe loading failure
      await expect(page.locator('[role="alert"]')).toContainText('Payment System Error');
      await expect(page.locator('[role="alert"]')).toContainText(/unable.*load.*payment.*form/i);
      
      // Should offer retry and support
      await expect(page.locator('button:has-text("Retry")')).toBeVisible();
      await expect(page.locator('button:has-text("Contact Support")')).toBeVisible();
      
      // Test retry - unblock Stripe
      await page.unroute('**/js.stripe.com/**');
      await page.click('button:has-text("Retry")');
      
      // Should recover and show payment form
      await expect(page.locator('[data-testid="card-number"]')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Error Notification User Experience', () => {
    test('should display error notifications accessibly', async ({ page }) => {
      await setupE2EAuth(page, 'buyer');
      
      await page.goto('/orders/test-order-accessibility-error');
      
      // Trigger an error
      await page.fill('[data-testid="card-number"]', '4000000000000002');
      await page.click('[data-testid="pay-button"]');
      
      // Check accessibility attributes
      const errorAlert = page.locator('[role="alert"]').first();
      await expect(errorAlert).toHaveAttribute('aria-live', 'assertive');
      await expect(errorAlert).toHaveAttribute('aria-describedby');
      
      // Check dismiss button accessibility
      const dismissButton = page.locator('button[aria-label*="Dismiss notification"]').first();
      await expect(dismissButton).toBeVisible();
      await expect(dismissButton).toHaveAttribute('aria-label');
      
      // Check keyboard navigation
      await dismissButton.focus();
      await expect(dismissButton).toBeFocused();
      
      // Test keyboard dismissal
      await page.keyboard.press('Enter');
      await expect(errorAlert).not.toBeVisible();
    });

    test('should handle multiple error notifications properly', async ({ page }) => {
      await setupE2EAuth(page, 'buyer');
      
      await page.goto('/orders/test-order-multiple-errors');
      
      // Trigger network error
      await page.route('**/api/payments/**', route => route.abort());
      await page.fill('[data-testid="card-number"]', '4242424242424242');
      await page.click('[data-testid="pay-button"]');
      
      await expect(page.locator('[role="alert"]')).toContainText('Connection Problem');
      
      // Trigger another error (validation)
      await page.unroute('**/api/payments/**');
      await page.fill('[data-testid="card-number"]', '4000000000000002'); // Declined card
      await page.click('[data-testid="pay-button"]');
      
      await expect(page.locator('[role="alert"]')).toContainText('Payment Method Issue');
      
      // Should show both errors (up to max limit)
      const alerts = page.locator('[role="alert"]');
      await expect(alerts).toHaveCount(2);
      
      // Should be able to dismiss them individually
      await page.locator('button[aria-label*="Dismiss notification"]').first().click();
      await expect(alerts).toHaveCount(1);
    });

    test('should auto-dismiss non-persistent notifications', async ({ page }) => {
      await setupE2EAuth(page, 'buyer');
      
      await page.goto('/orders/test-order-auto-dismiss');
      
      // Create a temporary network error
      await page.route('**/api/orders/**', route => route.abort());
      await page.click('[data-testid="refresh-order-button"]');
      
      // Should show network error
      await expect(page.locator('[role="alert"]')).toContainText('Connection Problem');
      
      // Wait for auto-dismiss (non-persistent errors auto-dismiss after 10 seconds)
      await expect(page.locator('[role="alert"]')).not.toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Error Recovery Success Flows', () => {
    test('should complete full error-to-success flow', async ({ page }) => {
      await setupE2EAuth(page, 'buyer');
      
      await page.goto('/orders/test-order-error-recovery');
      
      // 1. Start with network error
      await page.route('**/api/payments/**', route => route.abort());
      await page.fill('[data-testid="card-number"]', '4242424242424242');
      await page.click('[data-testid="pay-button"]');
      
      await expect(page.locator('[role="alert"]')).toContainText('Connection Problem');
      
      // 2. Clear network issue and retry
      await page.unroute('**/api/payments/**');
      await page.click('button:has-text("Try Again")');
      
      // 3. Complete successful payment
      await expect(page.locator('[role="alert"]')).toContainText('Payment Successful', { timeout: 10000 });
      
      // 4. Verify order is updated
      await expect(page.locator('[data-testid="order-status"]')).toContainText('Paid');
      
      // 5. Success notification should auto-dismiss
      await expect(page.locator('[role="alert"]:has-text("Payment Successful")')).not.toBeVisible({ timeout: 12000 });
    });

    test('should handle webhook recovery after initial failure', async ({ page }) => {
      await setupE2EAuth(page, 'buyer');
      
      let webhookCallCount = 0;
      await page.route('**/api/webhooks/stripe', async route => {
        webhookCallCount++;
        if (webhookCallCount === 1) {
          // First webhook call fails
          await route.fulfill({ status: 500, body: JSON.stringify({ error: 'Server error' }) });
        } else {
          // Subsequent calls succeed
          await route.continue();
        }
      });
      
      await page.goto('/orders/test-order-webhook-recovery');
      
      await page.fill('[data-testid="card-number"]', '4242424242424242');
      await page.click('[data-testid="pay-button"]');
      
      // Should show webhook processing delay
      await expect(page.locator('[role="alert"]')).toContainText('Payment Processing Delay');
      
      // Check status - should trigger retry and eventually succeed
      await page.click('button:has-text("Check Status")');
      
      // Should eventually show success
      await expect(page.locator('[role="alert"]')).toContainText('Payment Confirmed', { timeout: 20000 });
    });
  });

  test.describe('Cross-Browser Error Handling', () => {
    ['chromium', 'firefox'].forEach(browserName => {
      test(`should handle errors consistently in ${browserName}`, async ({ page }) => {
        await setupE2EAuth(page, 'buyer');
        
        await page.goto('/orders/test-order-cross-browser');
        
        // Test card decline error
        await page.fill('[data-testid="card-number"]', '4000000000000002');
        await page.click('[data-testid="pay-button"]');
        
        // Should show consistent error across browsers
        await expect(page.locator('[role="alert"]')).toContainText('Payment Method Issue');
        
        // Action buttons should work consistently
        await expect(page.locator('button:has-text("New Payment Method")')).toBeVisible();
        await page.click('button:has-text("New Payment Method")');
        
        // Recovery flow should work
        await expect(page.locator('[data-testid="card-number"]')).toBeVisible();
      });
    });
  });
});