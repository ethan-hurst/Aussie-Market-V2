import { test, expect } from '@playwright/test';

test.describe('MVP Real-Time Auction Features', () => {

  test('real-time bid updates across multiple sessions', async ({ page, context }) => {
    const listingId = 'realtime-test-listing';
    let currentBidCents = 10000;
    let bidCount = 3;

    // Create multiple browser pages to simulate different users
    const buyerPage1 = page;
    const buyerPage2 = await context.newPage();
    const buyerPage3 = await context.newPage();

    const mockListing = {
      id: listingId,
      title: 'Real-Time Auction Test',
      current_bid_cents: currentBidCents,
      minimum_bid_cents: currentBidCents + 100,
      reserve_cents: 20000,
      end_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour
      bid_count: bidCount,
      status: 'active'
    };

    // Setup WebSocket simulation for all pages
    const setupWebSocketMocking = async (targetPage: any, userId: string) => {
      await targetPage.addInitScript((userId) => {
        // Mock WebSocket connection
        window.mockWebSocket = {
          send: (data) => console.log(`User ${userId} WebSocket send:`, data),
          close: () => console.log(`User ${userId} WebSocket closed`),
          readyState: 1,
          userId: userId
        };

        // Listen for bid updates
        window.addEventListener('websocket-bid-update', (event) => {
          const data = event.detail;
          
          // Update UI elements
          const currentBidEl = document.querySelector('[data-testid="current-bid"]');
          const minBidEl = document.querySelector('[data-testid="minimum-bid"]');
          const bidCountEl = document.querySelector('[data-testid="bid-count"]');
          
          if (currentBidEl) currentBidEl.textContent = `$${(data.current_bid_cents / 100).toFixed(2)}`;
          if (minBidEl) minBidEl.textContent = `$${(data.minimum_bid_cents / 100).toFixed(2)}`;
          if (bidCountEl) bidCountEl.textContent = `${data.bid_count} bids`;

          // Show notification if this user was outbid
          if (data.outbid_user_id === userId) {
            const notification = document.createElement('div');
            notification.setAttribute('data-testid', 'outbid-notification');
            notification.textContent = 'You have been outbid!';
            document.body.appendChild(notification);
          }

          // Update winning status
          const winningIndicator = document.querySelector('[data-testid="winning-bid-indicator"]');
          const losingIndicator = document.querySelector('[data-testid="losing-bid-indicator"]');
          
          if (data.winning_bidder_id === userId) {
            if (winningIndicator) winningIndicator.style.display = 'block';
            if (losingIndicator) losingIndicator.style.display = 'none';
          } else {
            if (winningIndicator) winningIndicator.style.display = 'none';
            if (losingIndicator) losingIndicator.style.display = 'block';
          }
        });
      }, userId);

      // Mock API routes
      await targetPage.route(`**/api/listings/${listingId}`, async (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ listing: mockListing })
        });
      });

      await targetPage.route(`**/api/listings/${listingId}/bids`, async (route) => {
        if (route.request().method() === 'POST') {
          const body = route.request().postDataJSON();
          const newBidAmount = body.amount_cents;
          
          // Update global state
          currentBidCents = newBidAmount;
          bidCount += 1;
          mockListing.current_bid_cents = currentBidCents;
          mockListing.minimum_bid_cents = currentBidCents + 100;
          mockListing.bid_count = bidCount;

          // Broadcast to all pages
          const broadcastData = {
            listing_id: listingId,
            current_bid_cents: currentBidCents,
            minimum_bid_cents: currentBidCents + 100,
            bid_count: bidCount,
            winning_bidder_id: userId,
            outbid_user_id: mockListing.current_winning_bidder || null
          };

          // Update current winning bidder
          mockListing.current_winning_bidder = userId;

          // Send update to all pages
          for (const p of [buyerPage1, buyerPage2, buyerPage3]) {
            await p.evaluate((data) => {
              window.dispatchEvent(new CustomEvent('websocket-bid-update', { detail: data }));
            }, broadcastData);
          }

          return route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              bid: { id: `bid-${Date.now()}`, amount_cents: newBidAmount, bidder_id: userId }
            })
          });
        }
        return route.continue();
      });

      await targetPage.setExtraHTTPHeaders({ 'x-test-user-id': userId });
    };

    // Setup all three user sessions
    await setupWebSocketMocking(buyerPage1, 'buyer-1');
    await setupWebSocketMocking(buyerPage2, 'buyer-2');
    await setupWebSocketMocking(buyerPage3, 'buyer-3');

    // Navigate all users to the listing
    await buyerPage1.goto(`/listings/${listingId}`);
    await buyerPage2.goto(`/listings/${listingId}`);
    await buyerPage3.goto(`/listings/${listingId}`);

    // Verify initial state on all pages
    for (const p of [buyerPage1, buyerPage2, buyerPage3]) {
      await expect(p.locator('[data-testid="current-bid"]')).toContainText('$100.00');
      await expect(p.locator('[data-testid="minimum-bid"]')).toContainText('$101.00');
    }

    // User 1 places first bid
    await buyerPage1.fill('[data-testid="bid-amount-input"]', '120.00');
    await buyerPage1.click('[data-testid="place-bid-button"]');
    await buyerPage1.click('[data-testid="confirm-bid-button"]');

    // Verify bid success for user 1
    await expect(buyerPage1.locator('[data-testid="bid-success-message"]')).toBeVisible();
    await expect(buyerPage1.locator('[data-testid="winning-bid-indicator"]')).toBeVisible();

    // Verify real-time updates on other pages (within 2 seconds)
    await expect(buyerPage2.locator('[data-testid="current-bid"]')).toContainText('$120.00', { timeout: 2000 });
    await expect(buyerPage3.locator('[data-testid="current-bid"]')).toContainText('$120.00', { timeout: 2000 });
    await expect(buyerPage2.locator('[data-testid="minimum-bid"]')).toContainText('$121.00');
    await expect(buyerPage3.locator('[data-testid="minimum-bid"]')).toContainText('$121.00');

    // User 2 places counter bid
    await buyerPage2.fill('[data-testid="bid-amount-input"]', '135.00');
    await buyerPage2.click('[data-testid="place-bid-button"]');
    await buyerPage2.click('[data-testid="confirm-bid-button"]');

    // Verify outbid notification for user 1
    await expect(buyerPage1.locator('[data-testid="outbid-notification"]')).toBeVisible({ timeout: 2000 });
    await expect(buyerPage1.locator('[data-testid="losing-bid-indicator"]')).toBeVisible();

    // Verify winning status for user 2
    await expect(buyerPage2.locator('[data-testid="winning-bid-indicator"]')).toBeVisible();

    // Verify updates propagated to user 3
    await expect(buyerPage3.locator('[data-testid="current-bid"]')).toContainText('$135.00', { timeout: 2000 });
    await expect(buyerPage3.locator('[data-testid="bid-count"]')).toContainText('5 bids');
  });

  test('auction countdown timer accuracy and synchronization', async ({ page, context }) => {
    const listingId = 'countdown-test-listing';
    const endTime = new Date(Date.now() + 300000); // 5 minutes from now

    await page.route(`**/api/listings/${listingId}`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          listing: {
            id: listingId,
            title: 'Countdown Test Auction',
            end_at: endTime.toISOString(),
            current_bid_cents: 5000,
            minimum_bid_cents: 5100,
            status: 'active'
          }
        })
      });
    });

    await page.goto(`/listings/${listingId}`);

    // Verify countdown timer is displayed
    await expect(page.locator('[data-testid="countdown-timer"]')).toBeVisible();

    // Check initial countdown shows approximately 5 minutes
    await expect(page.locator('[data-testid="countdown-minutes"]')).toHaveText(/^[45]$/); // 4 or 5 minutes

    // Create second page to verify synchronization
    const page2 = await context.newPage();
    await page2.route(`**/api/listings/${listingId}`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          listing: {
            id: listingId,
            title: 'Countdown Test Auction',
            end_at: endTime.toISOString(),
            current_bid_cents: 5000,
            minimum_bid_cents: 5100,
            status: 'active'
          }
        })
      });
    });

    await page2.goto(`/listings/${listingId}`);

    // Verify both pages show similar countdown (within 2 seconds difference)
    const time1 = await page.locator('[data-testid="countdown-seconds"]').textContent();
    const time2 = await page2.locator('[data-testid="countdown-seconds"]').textContent();
    
    const seconds1 = parseInt(time1 || '0');
    const seconds2 = parseInt(time2 || '0');
    expect(Math.abs(seconds1 - seconds2)).toBeLessThanOrEqual(2);

    // Wait a few seconds and verify countdown is decreasing
    await page.waitForTimeout(3000);
    const laterTime = await page.locator('[data-testid="countdown-seconds"]').textContent();
    const laterSeconds = parseInt(laterTime || '0');
    expect(laterSeconds).toBeLessThan(seconds1);
  });

  test('handles auction ending with last-minute bidding', async ({ page }) => {
    const listingId = 'last-minute-bidding-test';
    let auctionEndTime = new Date(Date.now() + 30000); // 30 seconds from now
    let auctionStatus = 'active';

    await page.route(`**/api/listings/${listingId}`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          listing: {
            id: listingId,
            title: 'Last Minute Bidding Test',
            end_at: auctionEndTime.toISOString(),
            current_bid_cents: 8000,
            minimum_bid_cents: 8100,
            status: auctionStatus,
            extension_rule: 'extend_5_minutes' // Mock extension rule
          }
        })
      });
    });

    await page.route(`**/api/listings/${listingId}/bids`, async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        
        // If bid placed in last 2 minutes, extend auction
        const timeRemaining = auctionEndTime.getTime() - Date.now();
        if (timeRemaining <= 120000) { // 2 minutes
          auctionEndTime = new Date(Date.now() + 300000); // Extend by 5 minutes
        }

        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            bid: { amount_cents: body.amount_cents },
            auction_extended: timeRemaining <= 120000,
            new_end_time: auctionEndTime.toISOString()
          })
        });
      }
      return route.continue();
    });

    await page.setExtraHTTPHeaders({ 'x-test-user-id': 'last-minute-bidder' });
    await page.goto(`/listings/${listingId}`);

    // Wait for countdown to show under 1 minute
    await expect(page.locator('[data-testid="countdown-urgent"]')).toBeVisible({ timeout: 35000 });

    // Place bid in last minute
    await page.fill('[data-testid="bid-amount-input"]', '95.00');
    await page.click('[data-testid="place-bid-button"]');

    // Should show extension warning
    await expect(page.locator('[data-testid="extension-warning"]')).toBeVisible();
    await page.click('[data-testid="confirm-bid-button"]');

    // Verify auction was extended
    await expect(page.locator('[data-testid="auction-extended-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="countdown-minutes"]')).toHaveText(/^[45]$/); // Back to ~5 minutes
  });

  test('WebSocket connection resilience and reconnection', async ({ page }) => {
    const listingId = 'websocket-resilience-test';

    // Mock WebSocket with connection disruption
    await page.addInitScript(() => {
      let connectionAttempts = 0;
      window.mockWebSocketState = {
        connected: true,
        reconnectAttempts: 0
      };

      // Simulate connection loss after 5 seconds
      setTimeout(() => {
        window.mockWebSocketState.connected = false;
        
        // Dispatch connection lost event
        window.dispatchEvent(new CustomEvent('websocket-connection-lost'));
        
        // Simulate reconnection after 3 seconds
        setTimeout(() => {
          window.mockWebSocketState.connected = true;
          window.mockWebSocketState.reconnectAttempts++;
          window.dispatchEvent(new CustomEvent('websocket-reconnected'));
        }, 3000);
      }, 5000);
    });

    await page.route(`**/api/listings/${listingId}`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          listing: {
            id: listingId,
            title: 'WebSocket Resilience Test',
            current_bid_cents: 12000,
            minimum_bid_cents: 12100,
            end_at: new Date(Date.now() + 1800000).toISOString() // 30 minutes
          }
        })
      });
    });

    await page.goto(`/listings/${listingId}`);

    // Verify initial connection status
    await expect(page.locator('[data-testid="connection-status-connected"]')).toBeVisible();

    // Wait for connection loss
    await expect(page.locator('[data-testid="connection-lost-warning"]')).toBeVisible({ timeout: 8000 });

    // Verify reconnection
    await expect(page.locator('[data-testid="connection-status-connected"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="reconnected-message"]')).toBeVisible();
  });

  test('concurrent bidding race condition handling', async ({ page, context }) => {
    const listingId = 'race-condition-test';
    let processedBids = 0;

    const mockListing = {
      id: listingId,
      title: 'Race Condition Test',
      current_bid_cents: 15000,
      minimum_bid_cents: 15100,
      end_at: new Date(Date.now() + 3600000).toISOString()
    };

    // Setup race condition simulation
    const setupBidderPage = async (targetPage: any, userId: string) => {
      await targetPage.route(`**/api/listings/${listingId}`, async (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json', 
          body: JSON.stringify({ listing: mockListing })
        });
      });

      await targetPage.route(`**/api/listings/${listingId}/bids`, async (route) => {
        if (route.request().method() === 'POST') {
          const body = route.request().postDataJSON();
          
          // Simulate processing delay to trigger race conditions
          await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
          
          processedBids++;
          
          // Only the first bid should succeed if amounts are identical
          if (processedBids === 1 || body.amount_cents > mockListing.current_bid_cents) {
            mockListing.current_bid_cents = body.amount_cents;
            mockListing.minimum_bid_cents = body.amount_cents + 100;
            
            return route.fulfill({
              status: 201,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                bid: { amount_cents: body.amount_cents, bidder_id: userId }
              })
            });
          } else {
            return route.fulfill({
              status: 409,
              contentType: 'application/json',
              body: JSON.stringify({
                error: 'Bid amount no longer valid',
                current_minimum: mockListing.minimum_bid_cents
              })
            });
          }
        }
        return route.continue();
      });

      await targetPage.setExtraHTTPHeaders({ 'x-test-user-id': userId });
    };

    // Create multiple bidder pages
    const bidder1 = page;
    const bidder2 = await context.newPage();
    const bidder3 = await context.newPage();

    await setupBidderPage(bidder1, 'bidder-1');
    await setupBidderPage(bidder2, 'bidder-2'); 
    await setupBidderPage(bidder3, 'bidder-3');

    // Navigate all bidders to listing
    await bidder1.goto(`/listings/${listingId}`);
    await bidder2.goto(`/listings/${listingId}`);
    await bidder3.goto(`/listings/${listingId}`);

    // All bidders attempt to place the same bid simultaneously
    const bidPromises = [
      bidder1.fill('[data-testid="bid-amount-input"]', '160.00').then(() => bidder1.click('[data-testid="place-bid-button"]')),
      bidder2.fill('[data-testid="bid-amount-input"]', '160.00').then(() => bidder2.click('[data-testid="place-bid-button"]')),
      bidder3.fill('[data-testid="bid-amount-input"]', '160.00').then(() => bidder3.click('[data-testid="place-bid-button"]'))
    ];

    await Promise.all(bidPromises);

    // Confirm bids simultaneously
    await Promise.all([
      bidder1.click('[data-testid="confirm-bid-button"]'),
      bidder2.click('[data-testid="confirm-bid-button"]'),
      bidder3.click('[data-testid="confirm-bid-button"]')
    ]);

    // Only one should succeed, others should get error messages
    const successMessages = await Promise.all([
      bidder1.locator('[data-testid="bid-success-message"]').isVisible().catch(() => false),
      bidder2.locator('[data-testid="bid-success-message"]').isVisible().catch(() => false),
      bidder3.locator('[data-testid="bid-success-message"]').isVisible().catch(() => false)
    ]);

    const errorMessages = await Promise.all([
      bidder1.locator('[data-testid="bid-error-message"]').isVisible().catch(() => false),
      bidder2.locator('[data-testid="bid-error-message"]').isVisible().catch(() => false),
      bidder3.locator('[data-testid="bid-error-message"]').isVisible().catch(() => false)
    ]);

    // Exactly one success, two errors
    expect(successMessages.filter(Boolean).length).toBe(1);
    expect(errorMessages.filter(Boolean).length).toBe(2);
  });
});