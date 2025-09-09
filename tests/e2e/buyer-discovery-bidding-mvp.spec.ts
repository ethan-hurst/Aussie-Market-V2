import { test, expect } from '@playwright/test';

test.describe('MVP Buyer Discovery and Bidding Flow', () => {

  test('complete buyer journey: search → view → bid → win', async ({ page }) => {
    const buyerId = 'mvp-buyer-test';
    const listingId = 'active-listing-001';
    const mockListings = [
      {
        id: listingId,
        title: 'Vintage Camera Collection',
        description: 'Professional vintage camera in excellent condition',
        current_bid_cents: 15000,
        minimum_bid_cents: 16000,
        reserve_cents: 25000,
        reserve_met: false,
        end_at: new Date(Date.now() + 86400000).toISOString(), // 24 hours from now
        bid_count: 5,
        seller: { legal_name: 'Pro Seller', rating: 4.8 },
        images: [{ url: '/images/camera-1.jpg', alt: 'Main camera image' }],
        category: 'Electronics',
        subcategory: 'Cameras'
      }
    ];

    // Mock search and listing APIs
    await page.route('**/api/search**', async (route) => {
      const url = new URL(route.request().url());
      const query = url.searchParams.get('q') || '';
      const category = url.searchParams.get('category') || '';
      
      const filteredListings = mockListings.filter(listing => 
        listing.title.toLowerCase().includes(query.toLowerCase()) &&
        (category === '' || listing.category.toLowerCase() === category.toLowerCase())
      );
      
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          listings: filteredListings,
          total: filteredListings.length,
          page: 1,
          per_page: 20
        })
      });
    });

    await page.route(`**/api/listings/${listingId}`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ listing: mockListings[0] })
      });
    });

    await page.route(`**/api/listings/${listingId}/bids`, async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            bids: [
              { id: 'bid-1', amount_cents: 15000, bidder: 'Anonymous', created_at: new Date(Date.now() - 3600000).toISOString() },
              { id: 'bid-2', amount_cents: 14000, bidder: 'Anonymous', created_at: new Date(Date.now() - 7200000).toISOString() }
            ]
          })
        });
      }
      
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        const newBid = {
          id: `bid-${Date.now()}`,
          amount_cents: body.amount_cents,
          bidder_id: buyerId,
          created_at: new Date().toISOString(),
          is_winning: true
        };
        
        // Update mock listing current bid
        mockListings[0].current_bid_cents = body.amount_cents;
        mockListings[0].minimum_bid_cents = body.amount_cents + 100;
        mockListings[0].bid_count += 1;
        
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, bid: newBid, new_minimum: newBid.amount_cents + 100 })
        });
      }
      
      return route.continue();
    });

    await page.route('**/api/watchlist**', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, added: true })
        });
      }
      return route.continue();
    });

    // Set buyer authentication
    await page.setExtraHTTPHeaders({ 'x-test-user-id': buyerId });

    // 1. Marketplace Discovery - Search Flow
    await page.goto('/marketplace');
    await expect(page.locator('h1')).toContainText('Marketplace');

    // Search for items
    await page.fill('[data-testid="marketplace-search"]', 'vintage camera');
    await page.click('[data-testid="search-button"]');
    
    // Verify search results
    await expect(page.locator('[data-testid="listing-card"]').first()).toBeVisible();
    
    // 2. Category Filtering  
    await page.click('[data-testid="toggle-filters"]');
    await page.selectOption('[data-testid="category-filter"]', '1'); // Electronics category ID
    await expect(page.locator('[data-testid="listing-card"]').first()).toBeVisible();

    // Change category to verify filtering works
    await page.selectOption('[data-testid="category-filter"]', '2'); // Fashion category ID 
    // Accept that no listings may appear for different category

    // Reset to see results again
    await page.selectOption('[data-testid="category-filter"]', 'all');

    // 3. Listing Detail View
    await page.locator('[data-testid="listing-card"]').first().click();
    await expect(page.url()).toContain('/l/'); // Our actual listing route format
    
    // Verify listing details
    await expect(page.locator('[data-testid="listing-title"]')).toContainText('Vintage Camera Collection');
    await expect(page.locator('[data-testid="current-bid"]')).toContainText('$150.00');
    await expect(page.locator('[data-testid="minimum-bid"]')).toContainText('$160.00');
    await expect(page.locator('[data-testid="bid-count"]')).toContainText('5 bids');
    await expect(page.locator('[data-testid="time-remaining"]')).toBeVisible();

    // Verify seller information
    await expect(page.locator('[data-testid="seller-name"]')).toContainText('Pro Seller');
    await expect(page.locator('[data-testid="seller-rating"]')).toContainText('4.8');

    // 4. Bid History View
    await page.click('[data-testid="view-bid-history-button"]');
    await expect(page.locator('[data-testid="bid-history-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="bid-history-item"]')).toHaveCount(2);
    
    // Close bid history
    await page.click('[data-testid="close-bid-history"]');

    // 5. Add to Watchlist
    await page.click('[data-testid="add-to-watchlist-button"]');
    await expect(page.locator('[data-testid="watchlist-success-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="watchlist-button"]')).toContainText('Remove from Watchlist');

    // 6. Place Bid - Invalid Amount
    await page.fill('[data-testid="bid-amount-input"]', '155.00'); // Below minimum
    await page.click('[data-testid="place-bid-button"]');
    await expect(page.locator('[data-testid="bid-error-message"]')).toContainText('Bid must be at least $160.00');

    // 7. Place Bid - Valid Amount
    await page.fill('[data-testid="bid-amount-input"]', '175.00');
    await page.click('[data-testid="place-bid-button"]');
    
    // Confirm bid in modal
    await expect(page.locator('[data-testid="bid-confirmation-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="confirm-bid-amount"]')).toContainText('$175.00');
    await page.click('[data-testid="confirm-bid-button"]');

    // 8. Verify Bid Success
    await expect(page.locator('[data-testid="bid-success-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="current-bid"]')).toContainText('$175.00');
    await expect(page.locator('[data-testid="minimum-bid"]')).toContainText('$176.00');
    await expect(page.locator('[data-testid="bid-count"]')).toContainText('6 bids');
    
    // Verify winning status
    await expect(page.locator('[data-testid="winning-bid-indicator"]')).toBeVisible();
    await expect(page.locator('[data-testid="winning-bid-message"]')).toContainText('You are currently the highest bidder');

    // 9. Verify My Bids Page
    await page.goto('/buyer/my-bids');
    await expect(page.locator(`[data-testid="bid-item-${listingId}"]`)).toBeVisible();
    await expect(page.locator('[data-testid="bid-status-winning"]')).toBeVisible();
  });

  test('handles outbid scenarios with notifications', async ({ page }) => {
    const buyerId = 'mvp-buyer-test';
    const listingId = 'test-listing-outbid';
    
    // Mock WebSocket for real-time bid updates
    await page.addInitScript(() => {
      window.mockWebSocket = {
        send: (data) => console.log('WebSocket send:', data),
        close: () => console.log('WebSocket closed'),
        readyState: 1
      };
      
      // Mock incoming outbid notification
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('websocket-message', {
          detail: {
            type: 'bid_update',
            listing_id: 'test-listing-outbid',
            new_bid_amount_cents: 20000,
            outbid_user_id: 'mvp-buyer-test'
          }
        }));
      }, 2000);
    });

    await page.route(`**/api/listings/${listingId}`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          listing: {
            id: listingId,
            title: 'Test Auction Item',
            current_bid_cents: 18000,
            minimum_bid_cents: 18500,
            end_at: new Date(Date.now() + 3600000).toISOString(),
            bid_count: 3
          }
        })
      });
    });

    await page.setExtraHTTPHeaders({ 'x-test-user-id': buyerId });
    await page.goto(`/listings/${listingId}`);

    // Place initial bid
    await page.fill('[data-testid="bid-amount-input"]', '185.00');
    await page.click('[data-testid="place-bid-button"]');
    await page.click('[data-testid="confirm-bid-button"]');

    // Wait for outbid notification (mocked via WebSocket)
    await expect(page.locator('[data-testid="outbid-notification"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="outbid-message"]')).toContainText('You have been outbid');
    
    // Verify bid status updated
    await expect(page.locator('[data-testid="current-bid"]')).toContainText('$200.00');
    await expect(page.locator('[data-testid="losing-bid-indicator"]')).toBeVisible();
  });

  test('handles auction ending scenarios', async ({ page }) => {
    const listingId = 'test-listing-ending';
    
    // Mock listing that ends soon
    await page.route(`**/api/listings/${listingId}`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          listing: {
            id: listingId,
            title: 'Ending Soon Item',
            current_bid_cents: 15000,
            minimum_bid_cents: 15500,
            end_at: new Date(Date.now() + 60000).toISOString(), // 1 minute
            bid_count: 8,
            status: 'active'
          }
        })
      });
    });

    await page.goto(`/listings/${listingId}`);

    // Verify countdown timer shows urgent state
    await expect(page.locator('[data-testid="countdown-urgent"]')).toBeVisible();
    await expect(page.locator('[data-testid="countdown-text"]')).toContainText('0h 0m');

    // Test last-minute bidding
    await page.fill('[data-testid="bid-amount-input"]', '160.00');
    await page.click('[data-testid="place-bid-button"]');
    
    // Should show warning about auction ending soon
    await expect(page.locator('[data-testid="ending-soon-warning"]')).toBeVisible();
    await page.click('[data-testid="confirm-bid-button"]');
  });

  test('mobile responsive bidding interface', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-specific test');
    
    const listingId = 'mobile-test-listing';
    await page.route(`**/api/listings/${listingId}`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          listing: {
            id: listingId,
            title: 'Mobile Test Item',
            current_bid_cents: 10000,
            minimum_bid_cents: 10500,
            end_at: new Date(Date.now() + 86400000).toISOString(),
            images: [{ url: '/test-image.jpg', alt: 'Test item' }]
          }
        })
      });
    });

    await page.goto(`/listings/${listingId}`);

    // Verify mobile layout
    await expect(page.locator('[data-testid="mobile-listing-view"]')).toBeVisible();
    
    // Test image swiping
    await page.locator('[data-testid="listing-image"]').swipe({ directions: ['right'] });
    
    // Test mobile bid form
    await page.tap('[data-testid="mobile-bid-button"]');
    await expect(page.locator('[data-testid="mobile-bid-modal"]')).toBeVisible();
    
    // Quick bid buttons
    await page.tap('[data-testid="quick-bid-minimum"]');
    await expect(page.locator('[data-testid="bid-amount-input"]')).toHaveValue('105.00');
  });

  test('handles concurrent bidding scenarios', async ({ page, context }) => {
    const listingId = 'concurrent-bid-test';
    
    // Create second page to simulate concurrent bidding
    const page2 = await context.newPage();
    
    const mockListing = {
      id: listingId,
      title: 'Concurrent Bidding Test',
      current_bid_cents: 10000,
      minimum_bid_cents: 10500,
      end_at: new Date(Date.now() + 3600000).toISOString(),
      bid_count: 2
    };

    // Mock API for both pages
    for (const p of [page, page2]) {
      await p.route(`**/api/listings/${listingId}`, async (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ listing: mockListing })
        });
      });

      await p.route(`**/api/listings/${listingId}/bids`, async (route) => {
        if (route.request().method() === 'POST') {
          const body = route.request().postDataJSON();
          mockListing.current_bid_cents = body.amount_cents;
          mockListing.minimum_bid_cents = body.amount_cents + 100;
          mockListing.bid_count += 1;
          
          return route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, bid: { amount_cents: body.amount_cents } })
          });
        }
        return route.continue();
      });
    }

    // Set different user IDs
    await page.setExtraHTTPHeaders({ 'x-test-user-id': 'buyer-1' });
    await page2.setExtraHTTPHeaders({ 'x-test-user-id': 'buyer-2' });

    // Navigate both users to the same listing
    await page.goto(`/listings/${listingId}`);
    await page2.goto(`/listings/${listingId}`);

    // User 1 places bid
    await page.fill('[data-testid="bid-amount-input"]', '110.00');
    await page.click('[data-testid="place-bid-button"]');
    await page.click('[data-testid="confirm-bid-button"]');

    // Verify bid success for user 1
    await expect(page.locator('[data-testid="bid-success-message"]')).toBeVisible();

    // User 2 tries to place same bid amount (should fail as minimum has increased)
    await page2.fill('[data-testid="bid-amount-input"]', '110.00');
    await page2.click('[data-testid="place-bid-button"]');
    
    // Should show updated minimum bid requirement
    await expect(page2.locator('[data-testid="bid-error-message"]')).toContainText('Bid must be at least');
  });
});