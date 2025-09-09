import { test, expect } from '@playwright/test';

test.describe('MVP Complete Integration Testing Suite', () => {

  test('end-to-end marketplace transaction flow', async ({ page, context }) => {
    // Complete user journey: seller creates listing → buyer bids → payment → fulfillment
    const sellerId = 'integration-seller-001';
    const buyerId = 'integration-buyer-001'; 
    const listingId = 'integration-listing-001';
    const orderId = 'integration-order-001';

    // Shared mock data
    const mockListing = {
      id: listingId,
      title: 'Integration Test Vintage Watch',
      description: 'Premium vintage watch for integration testing',
      start_cents: 20000,
      current_bid_cents: 25000,
      minimum_bid_cents: 26000,
      reserve_cents: 35000,
      end_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour
      seller_id: sellerId,
      status: 'active',
      images: [
        { id: 'img1', url: '/integration/watch-1.jpg', alt: 'Watch front view' },
        { id: 'img2', url: '/integration/watch-2.jpg', alt: 'Watch side view' }
      ]
    };

    const mockOrder = {
      id: orderId,
      listing_id: listingId,
      buyer_id: buyerId,
      seller_id: sellerId,
      amount_cents: 35000, // Final winning bid
      total_amount_cents: 36750, // Including fees
      platform_fee_cents: 1750,
      state: 'pending_payment',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Setup comprehensive API mocks
    await page.route('**/api/auth/login', async (route) => {
      const body = route.request().postDataJSON();
      const userId = body.email.includes('seller') ? sellerId : buyerId;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: { id: userId, email: body.email, role: userId.includes('seller') ? 'seller' : 'buyer' },
          token: `mock-jwt-${userId}`
        })
      });
    });

    await page.route('**/api/listings', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            listing: { ...mockListing, ...body, id: listingId, seller_id: sellerId }
          })
        });
      }
      return route.continue();
    });

    await page.route(`**/api/listings/${listingId}`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ listing: mockListing })
      });
    });

    await page.route(`**/api/listings/${listingId}/bids`, async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        mockListing.current_bid_cents = body.amount_cents;
        mockListing.minimum_bid_cents = body.amount_cents + 100;
        
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            bid: { id: 'winning-bid', amount_cents: body.amount_cents, bidder_id: buyerId },
            is_winning: true
          })
        });
      }
      
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          bids: [
            { id: 'bid-1', amount_cents: 22000, created_at: '2024-01-01T10:00:00Z' },
            { id: 'bid-2', amount_cents: 25000, created_at: '2024-01-01T11:00:00Z' }
          ]
        })
      });
    });

    await page.route('**/api/auctions/finalize', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          order: mockOrder,
          winner: { id: buyerId, email: 'buyer@integration.test' }
        })
      });
    });

    await page.route(`**/api/orders/${orderId}`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          order: {
            ...mockOrder,
            listing: mockListing,
            buyer: { id: buyerId, legal_name: 'Integration Buyer', email: 'buyer@integration.test' },
            seller: { id: sellerId, legal_name: 'Integration Seller', email: 'seller@integration.test' }
          }
        })
      });
    });

    await page.route('**/api/payments/create-intent', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clientSecret: 'pi_mock_client_secret',
          paymentIntentId: 'pi_integration_test'
        })
      });
    });

    await page.route('**/api/payments/confirm', async (route) => {
      mockOrder.state = 'paid';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, orderState: 'paid' })
      });
    });

    // PHASE 1: Seller creates and publishes listing
    await page.goto('/auth/login');
    await page.fill('[data-testid="email-input"]', 'seller@integration.test');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    
    await expect(page.locator('[data-testid="login-success"]')).toBeVisible();
    
    await page.goto('/seller/create-listing');
    
    // Create listing
    await page.fill('[data-testid="title-input"]', mockListing.title);
    await page.fill('[data-testid="description-textarea"]', mockListing.description);
    await page.fill('[data-testid="start-price-input"]', '200.00');
    await page.fill('[data-testid="reserve-price-input"]', '350.00');
    await page.selectOption('[data-testid="duration-select"]', '1'); // 1 hour for testing
    
    await page.click('[data-testid="publish-listing-button"]');
    await expect(page.locator('[data-testid="listing-published-message"]')).toBeVisible();

    // PHASE 2: Switch to buyer perspective
    const buyerPage = await context.newPage();
    
    // Set up same API routes for buyer page
    await buyerPage.route('**/api/auth/login', async (route) => {
      const body = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: { id: buyerId, email: body.email, role: 'buyer' },
          token: `mock-jwt-${buyerId}`
        })
      });
    });

    await buyerPage.route(`**/api/listings/${listingId}`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ listing: mockListing })
      });
    });

    await buyerPage.route(`**/api/listings/${listingId}/bids`, async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        mockListing.current_bid_cents = body.amount_cents;
        mockListing.minimum_bid_cents = body.amount_cents + 100;
        
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            bid: { id: 'winning-bid', amount_cents: body.amount_cents, bidder_id: buyerId },
            is_winning: true
          })
        });
      }
      return route.continue();
    });

    await buyerPage.route('**/api/search**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          listings: [mockListing],
          total: 1
        })
      });
    });

    // Buyer login
    await buyerPage.goto('/auth/login');
    await buyerPage.fill('[data-testid="email-input"]', 'buyer@integration.test');
    await buyerPage.fill('[data-testid="password-input"]', 'password123');
    await buyerPage.click('[data-testid="login-button"]');
    
    // Buyer finds and bids on listing
    await buyerPage.goto('/marketplace');
    await buyerPage.fill('[data-testid="search-input"]', 'vintage watch');
    await buyerPage.click('[data-testid="search-button"]');
    
    await expect(buyerPage.locator(`[data-testid="listing-card-${listingId}"]`)).toBeVisible();
    await buyerPage.click(`[data-testid="listing-card-${listingId}"]`);
    
    // Place winning bid
    await buyerPage.fill('[data-testid="bid-amount-input"]', '350.00'); // Meets reserve
    await buyerPage.click('[data-testid="place-bid-button"]');
    await buyerPage.click('[data-testid="confirm-bid-button"]');
    
    await expect(buyerPage.locator('[data-testid="bid-success-message"]')).toBeVisible();
    await expect(buyerPage.locator('[data-testid="winning-bid-indicator"]')).toBeVisible();

    // PHASE 3: Simulate auction ending and order creation
    // Mock auction end time passed
    mockListing.end_at = new Date(Date.now() - 1000).toISOString();
    mockListing.status = 'ended';

    await buyerPage.route('**/api/auctions/finalize', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          order: mockOrder,
          winner: { id: buyerId, email: 'buyer@integration.test' }
        })
      });
    });

    // Simulate auction finalization (this would normally be triggered by the system)
    await buyerPage.evaluate(() => {
      fetch('/api/auctions/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: 'integration-listing-001' })
      });
    });

    // PHASE 4: Payment flow
    await buyerPage.route(`**/api/orders/${orderId}`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          order: {
            ...mockOrder,
            listing: mockListing,
            buyer: { id: buyerId, legal_name: 'Integration Buyer', email: 'buyer@integration.test' },
            seller: { id: sellerId, legal_name: 'Integration Seller', email: 'seller@integration.test' }
          }
        })
      });
    });

    await buyerPage.route('**/api/payments/create-intent', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clientSecret: 'pi_mock_client_secret',
          paymentIntentId: 'pi_integration_test'
        })
      });
    });

    await buyerPage.route('**/api/payments/confirm', async (route) => {
      mockOrder.state = 'paid';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, orderState: 'paid' })
      });
    });

    // Navigate to payment page
    await buyerPage.goto(`/orders/${orderId}/pay`);
    await expect(buyerPage.locator('[data-testid="payment-form"]')).toBeVisible();
    await expect(buyerPage.locator('[data-testid="order-total"]')).toContainText('$367.50');

    // Simulate payment confirmation
    await buyerPage.evaluate(() => {
      fetch('/api/payments/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: 'integration-order-001', paymentIntentId: 'pi_integration_test' })
      });
    });

    await buyerPage.goto(`/orders/${orderId}`);
    await expect(buyerPage.locator('[data-testid="payment-success-indicator"]')).toBeVisible();

    // PHASE 5: Seller order fulfillment
    await page.route(`**/api/orders/${orderId}`, async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        switch (body.action) {
          case 'mark_ready':
            mockOrder.state = 'ready_for_handover';
            break;
          case 'mark_shipped':
            mockOrder.state = 'shipped';
            break;
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, state: mockOrder.state })
        });
      }
      
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          order: {
            ...mockOrder,
            listing: mockListing,
            buyer: { id: buyerId, legal_name: 'Integration Buyer', email: 'buyer@integration.test' },
            seller: { id: sellerId, legal_name: 'Integration Seller', email: 'seller@integration.test' }
          }
        })
      });
    });

    // Seller marks order as ready
    await page.goto(`/orders/${orderId}`);
    await expect(page.locator('[data-testid="order-details"]')).toBeVisible();
    
    await page.click('[data-testid="mark-ready-button"]');
    await expect(page.locator('[data-testid="order-state-ready"]')).toBeVisible();

    // Seller marks as shipped
    await page.fill('[data-testid="tracking-number-input"]', 'TRACK123456789');
    await page.click('[data-testid="mark-shipped-button"]');
    await expect(page.locator('[data-testid="order-state-shipped"]')).toBeVisible();

    // PHASE 6: Buyer confirms delivery
    await buyerPage.route(`**/api/orders/${orderId}`, async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        if (body.action === 'confirm_delivery') {
          mockOrder.state = 'delivered';
        } else if (body.action === 'release_funds') {
          mockOrder.state = 'completed';
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, state: mockOrder.state })
        });
      }
      
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          order: {
            ...mockOrder,
            listing: mockListing,
            buyer: { id: buyerId, legal_name: 'Integration Buyer', email: 'buyer@integration.test' },
            seller: { id: sellerId, legal_name: 'Integration Seller', email: 'seller@integration.test' }
          }
        })
      });
    });

    await buyerPage.reload();
    await expect(buyerPage.locator('[data-testid="tracking-info"]')).toContainText('TRACK123456');

    // Buyer confirms delivery
    await buyerPage.click('[data-testid="confirm-delivery-button"]');
    await expect(buyerPage.locator('[data-testid="order-state-delivered"]')).toBeVisible();

    // Buyer releases funds
    await buyerPage.click('[data-testid="release-funds-button"]');
    await expect(buyerPage.locator('[data-testid="order-state-completed"]')).toBeVisible();

    // PHASE 7: Verify transaction completion
    await expect(buyerPage.locator('[data-testid="transaction-complete-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="funds-released-notification"]')).toBeVisible();

    console.log('✅ Complete end-to-end integration test successful');
  });

  test('error resilience and recovery flows', async ({ page }) => {
    // Test system behavior under various error conditions
    let apiCallCount = 0;
    const errorScenarios = ['timeout', 'server_error', 'network_error', 'validation_error'];
    let currentScenario = 0;

    await page.route('**/api/**', async (route) => {
      apiCallCount++;
      const scenario = errorScenarios[currentScenario % errorScenarios.length];
      
      // Inject errors periodically
      if (apiCallCount % 5 === 0) {
        switch (scenario) {
          case 'timeout':
            await new Promise(resolve => setTimeout(resolve, 10000)); // 10s timeout
            break;
          case 'server_error':
            return route.fulfill({ status: 500, body: '{"error":"Internal server error"}' });
          case 'network_error':
            return route.abort('failed');
          case 'validation_error':
            return route.fulfill({ status: 422, body: '{"error":"Validation failed","details":{"field":"Invalid input"}}' });
        }
        currentScenario++;
      }
      
      // Return successful response for non-error cases
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: 'mock response' })
      });
    });

    await page.goto('/marketplace');

    // Test error boundary activation
    await expect(page.locator('[data-testid="error-boundary"], [data-testid="loading-spinner"], [data-testid="retry-button"]')).toBeVisible({ timeout: 15000 });

    // Test retry mechanism
    const retryButton = page.locator('[data-testid="retry-button"]');
    if (await retryButton.isVisible()) {
      await retryButton.click();
      
      // Should eventually recover or show meaningful error
      await expect(page.locator('[data-testid="marketplace-content"], [data-testid="error-message"]')).toBeVisible({ timeout: 10000 });
    }
  });

  test('data consistency across user sessions', async ({ page, context }) => {
    const listingId = 'consistency-test-listing';
    let sharedState = {
      currentBidCents: 10000,
      bidCount: 3
    };

    // Create multiple user sessions
    const user1Page = page;
    const user2Page = await context.newPage();
    const user3Page = await context.newPage();

    // Setup shared state management across pages
    const setupStatefulMocks = async (targetPage, userId) => {
      await targetPage.route(`**/api/listings/${listingId}`, async (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            listing: {
              id: listingId,
              title: 'Consistency Test Item',
              current_bid_cents: sharedState.currentBidCents,
              minimum_bid_cents: sharedState.currentBidCents + 100,
              bid_count: sharedState.bidCount,
              end_at: new Date(Date.now() + 3600000).toISOString()
            }
          })
        });
      });

      await targetPage.route(`**/api/listings/${listingId}/bids`, async (route) => {
        if (route.request().method() === 'POST') {
          const body = route.request().postDataJSON();
          
          // Update shared state atomically
          sharedState.currentBidCents = body.amount_cents;
          sharedState.bidCount += 1;

          // Broadcast update to all pages
          const updateData = {
            listing_id: listingId,
            current_bid_cents: sharedState.currentBidCents,
            minimum_bid_cents: sharedState.currentBidCents + 100,
            bid_count: sharedState.bidCount,
            winning_bidder: userId
          };

          // Simulate real-time updates
          for (const p of [user1Page, user2Page, user3Page]) {
            await p.evaluate((data) => {
              window.dispatchEvent(new CustomEvent('bid-update', { detail: data }));
            }, updateData);
          }

          return route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              bid: { amount_cents: body.amount_cents, bidder_id: userId }
            })
          });
        }
        return route.continue();
      });

      await targetPage.setExtraHTTPHeaders({ 'x-test-user-id': userId });
    };

    await setupStatefulMocks(user1Page, 'user-1');
    await setupStatefulMocks(user2Page, 'user-2');
    await setupStatefulMocks(user3Page, 'user-3');

    // All users navigate to the same listing
    await user1Page.goto(`/listings/${listingId}`);
    await user2Page.goto(`/listings/${listingId}`);
    await user3Page.goto(`/listings/${listingId}`);

    // Verify initial state consistency
    for (const p of [user1Page, user2Page, user3Page]) {
      await expect(p.locator('[data-testid="current-bid"]')).toContainText('$100.00');
      await expect(p.locator('[data-testid="bid-count"]')).toContainText('3 bids');
    }

    // User 1 places bid
    await user1Page.fill('[data-testid="bid-amount-input"]', '125.00');
    await user1Page.click('[data-testid="place-bid-button"]');
    await user1Page.click('[data-testid="confirm-bid-button"]');

    // Verify state consistency across all sessions within 3 seconds
    for (const p of [user2Page, user3Page]) {
      await expect(p.locator('[data-testid="current-bid"]')).toContainText('$125.00', { timeout: 3000 });
      await expect(p.locator('[data-testid="bid-count"]')).toContainText('4 bids');
    }

    // User 2 immediately places counter-bid
    await user2Page.fill('[data-testid="bid-amount-input"]', '140.00');
    await user2Page.click('[data-testid="place-bid-button"]');
    await user2Page.click('[data-testid="confirm-bid-button"]');

    // Verify final state consistency
    for (const p of [user1Page, user3Page]) {
      await expect(p.locator('[data-testid="current-bid"]')).toContainText('$140.00', { timeout: 3000 });
      await expect(p.locator('[data-testid="bid-count"]')).toContainText('5 bids');
    }

    // Verify user 1 shows outbid status, user 2 shows winning status
    await expect(user1Page.locator('[data-testid="outbid-indicator"]')).toBeVisible();
    await expect(user2Page.locator('[data-testid="winning-indicator"]')).toBeVisible();
  });

  test('security validation and authorization', async ({ page, context }) => {
    const sellerId = 'security-seller';
    const buyerId = 'security-buyer';
    const maliciousId = 'malicious-user';
    const listingId = 'security-test-listing';
    const orderId = 'security-test-order';

    // Setup security testing scenarios
    await page.route('**/api/auth/**', async (route) => {
      const body = route.request().postDataJSON();
      const headers = route.request().headers();
      
      // Validate auth token format
      const authHeader = headers.authorization;
      if (authHeader && !authHeader.startsWith('Bearer ')) {
        return route.fulfill({ status: 401, body: '{"error":"Invalid auth format"}' });
      }
      
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, user: { id: sellerId } })
      });
    });

    await page.route(`**/api/listings/${listingId}`, async (route) => {
      const headers = route.request().headers();
      const userId = headers['x-test-user-id'];

      if (route.request().method() === 'PUT' || route.request().method() === 'DELETE') {
        // Only seller can modify their listings
        if (userId !== sellerId) {
          return route.fulfill({ 
            status: 403, 
            body: '{"error":"Unauthorized to modify this listing"}' 
          });
        }
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          listing: {
            id: listingId,
            title: 'Security Test Listing',
            seller_id: sellerId,
            current_bid_cents: 15000
          }
        })
      });
    });

    await page.route(`**/api/orders/${orderId}`, async (route) => {
      const headers = route.request().headers();
      const userId = headers['x-test-user-id'];

      // Only buyer or seller can access order
      if (userId !== buyerId && userId !== sellerId) {
        return route.fulfill({
          status: 403,
          body: '{"error":"Unauthorized to access this order"}'
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          order: { id: orderId, buyer_id: buyerId, seller_id: sellerId }
        })
      });
    });

    // Test 1: Unauthorized listing modification
    await page.setExtraHTTPHeaders({ 'x-test-user-id': maliciousId });
    
    const response1 = await page.request.put(`/api/listings/${listingId}`, {
      data: { title: 'Modified by attacker' }
    });
    expect(response1.status()).toBe(403);

    // Test 2: Unauthorized order access
    const response2 = await page.request.get(`/api/orders/${orderId}`);
    expect(response2.status()).toBe(403);

    // Test 3: Valid seller access
    await page.setExtraHTTPHeaders({ 'x-test-user-id': sellerId });
    
    const response3 = await page.request.get(`/api/listings/${listingId}`);
    expect(response3.status()).toBe(200);

    // Test 4: XSS prevention
    await page.goto(`/listings/${listingId}`);
    
    // Try to inject malicious script
    await page.route('**/api/comments', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        
        // Server should sanitize input
        const sanitizedComment = body.comment.replace(/<script.*?>.*?<\/script>/gi, '');
        
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            comment: { id: 1, text: sanitizedComment, user: 'test' }
          })
        });
      }
      return route.continue();
    });

    // Verify XSS protection in comments
    const maliciousScript = '<script>alert("xss")</script>Legitimate comment';
    await page.fill('[data-testid="comment-input"]', maliciousScript);
    await page.click('[data-testid="submit-comment"]');

    // Script should be stripped, legitimate text preserved
    await expect(page.locator('[data-testid="comment-text"]')).toContainText('Legitimate comment');
    await expect(page.locator('[data-testid="comment-text"]')).not.toContainText('<script>');

    console.log('✅ Security validation tests passed');
  });

  test('performance under realistic load conditions', async ({ page, context }) => {
    // Simulate realistic production load patterns
    const performanceMetrics = {
      pageLoads: [],
      apiResponses: [],
      memoryUsage: [],
      errorRates: []
    };

    // Create multiple concurrent user sessions
    const concurrentUsers = 5;
    const userPages = [];

    for (let i = 0; i < concurrentUsers; i++) {
      const userPage = await context.newPage();
      userPages.push(userPage);

      // Track performance for each user
      userPage.on('response', (response) => {
        performanceMetrics.apiResponses.push({
          url: response.url(),
          status: response.status(),
          timing: response.timing()
        });

        if (response.status() >= 400) {
          performanceMetrics.errorRates.push({
            url: response.url(),
            status: response.status(),
            timestamp: Date.now()
          });
        }
      });
    }

    // Mock realistic API response times
    await page.route('**/api/**', async (route) => {
      // Simulate variable response times based on endpoint complexity
      const url = route.request().url();
      let delay = 100; // Base delay

      if (url.includes('/search')) delay = 200 + Math.random() * 300;
      else if (url.includes('/listings/')) delay = 150 + Math.random() * 200;
      else if (url.includes('/bids')) delay = 300 + Math.random() * 400;
      else if (url.includes('/payments')) delay = 500 + Math.random() * 500;

      await new Promise(resolve => setTimeout(resolve, delay));

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: `Mock response for ${url}`,
          timestamp: Date.now(),
          response_time: delay
        })
      });
    });

    // Execute concurrent user workflows
    const startTime = Date.now();
    
    const userWorkflows = userPages.map(async (userPage, index) => {
      const workflowStart = Date.now();
      
      try {
        // Realistic user journey
        await userPage.goto('/marketplace');
        await userPage.waitForLoadState('networkidle');
        
        await userPage.fill('[data-testid="search-input"]', `search ${index}`);
        await userPage.click('[data-testid="search-button"]');
        await userPage.waitForLoadState('networkidle');
        
        await userPage.click('[data-testid="listing-card"]');
        await userPage.waitForLoadState('networkidle');
        
        // Simulate user reading/browsing time
        await userPage.waitForTimeout(2000 + Math.random() * 3000);
        
        const workflowTime = Date.now() - workflowStart;
        performanceMetrics.pageLoads.push({
          user: index,
          totalTime: workflowTime,
          success: true
        });

        return { success: true, time: workflowTime };
      } catch (error) {
        const workflowTime = Date.now() - workflowStart;
        performanceMetrics.pageLoads.push({
          user: index,
          totalTime: workflowTime,
          success: false,
          error: error.message
        });

        return { success: false, time: workflowTime, error: error.message };
      }
    });

    const results = await Promise.all(userWorkflows);
    const totalTestTime = Date.now() - startTime;

    // Analyze performance results
    const successfulWorkflows = results.filter(r => r.success);
    const failedWorkflows = results.filter(r => !r.success);
    
    const avgWorkflowTime = successfulWorkflows.reduce((sum, r) => sum + r.time, 0) / successfulWorkflows.length;
    const errorRate = performanceMetrics.errorRates.length / performanceMetrics.apiResponses.length;

    console.log('Performance Test Results:');
    console.log(`- Total test time: ${totalTestTime}ms`);
    console.log(`- Successful workflows: ${successfulWorkflows.length}/${concurrentUsers}`);
    console.log(`- Average workflow time: ${avgWorkflowTime.toFixed(0)}ms`);
    console.log(`- API error rate: ${(errorRate * 100).toFixed(2)}%`);

    // Performance assertions
    expect(successfulWorkflows.length).toBeGreaterThanOrEqual(concurrentUsers * 0.8); // 80% success rate
    expect(avgWorkflowTime).toBeLessThan(15000); // Average workflow under 15 seconds
    expect(errorRate).toBeLessThan(0.05); // Error rate under 5%

    // Cleanup
    await Promise.all(userPages.map(p => p.close()));
  });
});