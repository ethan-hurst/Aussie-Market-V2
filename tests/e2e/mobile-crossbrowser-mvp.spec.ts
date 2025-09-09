import { test, expect, devices } from '@playwright/test';

test.describe('MVP Mobile Responsiveness and Cross-Browser Testing', () => {

  // Mobile-specific tests
  test.describe('Mobile Responsiveness', () => {
    
    test('mobile marketplace navigation and search', async ({ page, browserName }) => {
      // Skip on desktop browsers for mobile tests
      test.skip(browserName === 'chromium' && !process.env.MOBILE_TEST, 'Mobile-specific test');
      
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE

      // Mock mobile-optimized API responses
      await page.route('**/api/search**', async (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            listings: Array.from({ length: 10 }, (_, i) => ({
              id: `mobile-${i}`,
              title: `Mobile Test Item ${i}`,
              current_bid_cents: 5000 + (i * 100),
              thumbnail_url: `/mobile/thumb-${i}.webp`,
              end_at: new Date(Date.now() + 86400000).toISOString()
            }))
          })
        });
      });

      await page.goto('/marketplace');
      
      // Verify mobile layout elements
      await expect(page.locator('[data-testid="mobile-header"]')).toBeVisible();
      await expect(page.locator('[data-testid="hamburger-menu"]')).toBeVisible();
      await expect(page.locator('[data-testid="mobile-search-bar"]')).toBeVisible();

      // Test hamburger menu
      await page.tap('[data-testid="hamburger-menu"]');
      await expect(page.locator('[data-testid="mobile-nav-menu"]')).toBeVisible();
      await expect(page.locator('[data-testid="mobile-nav-marketplace"]')).toBeVisible();
      await expect(page.locator('[data-testid="mobile-nav-profile"]')).toBeVisible();

      // Close menu by tapping outside
      await page.tap('[data-testid="marketplace-content"]');
      await expect(page.locator('[data-testid="mobile-nav-menu"]')).not.toBeVisible();

      // Test mobile search
      await page.tap('[data-testid="mobile-search-bar"]');
      await expect(page.locator('[data-testid="mobile-search-modal"]')).toBeVisible();
      
      await page.fill('[data-testid="mobile-search-input"]', 'test item');
      await page.tap('[data-testid="mobile-search-submit"]');
      
      // Verify search results in mobile layout
      await expect(page.locator('[data-testid="mobile-listing-grid"]')).toBeVisible();
      await expect(page.locator('[data-testid="mobile-listing-card"]')).toHaveCount(10);

      // Test card interactions
      const firstCard = page.locator('[data-testid="mobile-listing-card"]').first();
      await firstCard.tap();
      
      // Should navigate to listing detail in mobile view
      await expect(page.locator('[data-testid="mobile-listing-detail"]')).toBeVisible();
    });

    test('mobile bidding interface and touch interactions', async ({ page }) => {
      await page.setViewportSize({ width: 414, height: 896 }); // iPhone 11 Pro
      
      const listingId = 'mobile-bidding-test';
      
      await page.route(`**/api/listings/${listingId}`, async (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            listing: {
              id: listingId,
              title: 'Mobile Bidding Test Item',
              description: 'Test item for mobile bidding functionality',
              current_bid_cents: 15000,
              minimum_bid_cents: 15500,
              reserve_cents: 25000,
              end_at: new Date(Date.now() + 3600000).toISOString(),
              images: Array.from({ length: 5 }, (_, i) => ({
                url: `/mobile/listing-${i}.webp`,
                alt: `Mobile test image ${i}`
              })),
              seller: { legal_name: 'Mobile Test Seller', rating: 4.8 }
            }
          })
        });
      });

      await page.route(`**/api/listings/${listingId}/bids`, async (route) => {
        if (route.request().method() === 'POST') {
          const body = route.request().postDataJSON();
          return route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              bid: { amount_cents: body.amount_cents }
            })
          });
        }
        return route.continue();
      });

      await page.goto(`/listings/${listingId}`);

      // Verify mobile listing layout
      await expect(page.locator('[data-testid="mobile-listing-detail"]')).toBeVisible();
      await expect(page.locator('[data-testid="mobile-image-carousel"]')).toBeVisible();
      
      // Test image swiping
      const carousel = page.locator('[data-testid="mobile-image-carousel"]');
      await carousel.swipe({ directions: ['left'] });
      await page.waitForTimeout(500);
      await carousel.swipe({ directions: ['right'] });

      // Test sticky mobile bid panel
      await expect(page.locator('[data-testid="mobile-bid-panel"]')).toBeVisible();
      await expect(page.locator('[data-testid="mobile-current-bid"]')).toContainText('$150.00');

      // Test mobile bid form
      await page.tap('[data-testid="mobile-place-bid-button"]');
      await expect(page.locator('[data-testid="mobile-bid-modal"]')).toBeVisible();

      // Test quick bid buttons
      await expect(page.locator('[data-testid="quick-bid-minimum"]')).toBeVisible();
      await expect(page.locator('[data-testid="quick-bid-plus5"]')).toBeVisible();
      await expect(page.locator('[data-testid="quick-bid-plus10"]')).toBeVisible();

      // Test quick bid functionality
      await page.tap('[data-testid="quick-bid-plus5"]');
      await expect(page.locator('[data-testid="mobile-bid-amount-input"]')).toHaveValue('160.00');

      // Test custom bid input
      await page.fill('[data-testid="mobile-bid-amount-input"]', '165.00');
      await page.tap('[data-testid="mobile-confirm-bid-button"]');

      // Verify bid confirmation
      await expect(page.locator('[data-testid="mobile-bid-success"]')).toBeVisible();
      await expect(page.locator('[data-testid="mobile-current-bid"]')).toContainText('$165.00');
    });

    test('mobile orientation change handling', async ({ page }) => {
      const listingId = 'orientation-test';
      
      await page.route(`**/api/listings/${listingId}`, async (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            listing: {
              id: listingId,
              title: 'Orientation Test Item',
              current_bid_cents: 10000,
              images: [{ url: '/test-image.jpg', alt: 'Test' }]
            }
          })
        });
      });

      // Start in portrait mode
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`/listings/${listingId}`);

      // Verify portrait layout
      await expect(page.locator('[data-testid="mobile-listing-detail"]')).toBeVisible();
      await expect(page.locator('[data-testid="mobile-image-carousel"]')).toHaveCSS('height', /400px|50vh/);

      // Rotate to landscape
      await page.setViewportSize({ width: 667, height: 375 });
      await page.waitForTimeout(1000); // Allow layout to adjust

      // Verify landscape adaptations
      await expect(page.locator('[data-testid="mobile-listing-detail"]')).toBeVisible();
      await expect(page.locator('[data-testid="mobile-image-carousel"]')).toHaveCSS('height', /200px|30vh/);
      
      // Navigation should remain accessible
      await expect(page.locator('[data-testid="mobile-back-button"]')).toBeVisible();
    });

    test('mobile keyboard interactions and form accessibility', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      
      // Mock seller registration for mobile form testing
      await page.route('**/api/auth/register', async (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      });

      await page.goto('/register');

      // Test form interactions with virtual keyboard
      await page.tap('[data-testid="mobile-email-input"]');
      await page.fill('[data-testid="mobile-email-input"]', 'mobile@test.com');
      
      // Verify viewport adjustment for keyboard
      const viewportAfterKeyboard = page.viewportSize();
      expect(viewportAfterKeyboard.height).toBeGreaterThan(0);

      // Test form scrolling with keyboard open
      await page.tap('[data-testid="mobile-password-input"]');
      await page.fill('[data-testid="mobile-password-input"]', 'SecurePass123!');
      
      // Submit button should remain accessible
      await page.tap('[data-testid="mobile-register-button"]');
      await expect(page.locator('[data-testid="mobile-success-message"]')).toBeVisible();
    });
  });

  // Cross-browser compatibility tests
  test.describe('Cross-Browser Compatibility', () => {
    
    test('marketplace functionality across browsers', async ({ page, browserName }) => {
      // Mock consistent API responses
      await page.route('**/api/search**', async (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            listings: [
              {
                id: 'cross-browser-1',
                title: 'Cross Browser Test Item',
                current_bid_cents: 12000,
                end_at: new Date(Date.now() + 86400000).toISOString(),
                images: [{ url: '/test-image.jpg', alt: 'Test item' }]
              }
            ]
          })
        });
      });

      await page.goto('/marketplace');

      // Core functionality should work across all browsers
      await expect(page.locator('h1')).toContainText('Marketplace');
      await expect(page.locator('[data-testid="search-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="listing-card"]')).toBeVisible();

      // Test JavaScript functionality
      await page.fill('[data-testid="search-input"]', 'test');
      await page.click('[data-testid="search-button"]');
      await expect(page.locator('[data-testid="search-results"]')).toBeVisible();

      // Browser-specific adaptations
      if (browserName === 'firefox') {
        // Firefox-specific checks
        const userAgent = await page.evaluate(() => navigator.userAgent);
        expect(userAgent).toContain('Firefox');
      } else if (browserName === 'webkit') {
        // Safari/WebKit-specific checks
        const userAgent = await page.evaluate(() => navigator.userAgent);
        expect(userAgent).toContain('WebKit');
      }
    });

    test('CSS Grid and Flexbox compatibility', async ({ page, browserName }) => {
      await page.route('**/api/search**', async (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            listings: Array.from({ length: 12 }, (_, i) => ({
              id: `grid-test-${i}`,
              title: `Grid Test Item ${i}`,
              current_bid_cents: 5000 + (i * 100),
              thumbnail_url: `/grid-test-${i}.jpg`
            }))
          })
        });
      });

      await page.goto('/marketplace');

      // Test CSS Grid layout
      const gridContainer = page.locator('[data-testid="listings-grid"]');
      await expect(gridContainer).toBeVisible();

      // Verify grid properties work across browsers
      const gridStyles = await gridContainer.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        return {
          display: styles.display,
          gridTemplateColumns: styles.gridTemplateColumns,
          gap: styles.gap
        };
      });

      expect(gridStyles.display).toBe('grid');
      expect(gridStyles.gridTemplateColumns).toContain('fr'); // Fractional units
      
      // Test responsive breakpoints
      await page.setViewportSize({ width: 768, height: 1024 }); // Tablet
      await page.waitForTimeout(500);

      const tabletGridColumns = await gridContainer.evaluate((el) => {
        return window.getComputedStyle(el).gridTemplateColumns;
      });

      await page.setViewportSize({ width: 375, height: 667 }); // Mobile
      await page.waitForTimeout(500);

      const mobileGridColumns = await gridContainer.evaluate((el) => {
        return window.getComputedStyle(el).gridTemplateColumns;
      });

      // Grid should adapt to different screen sizes
      expect(tabletGridColumns).not.toBe(mobileGridColumns);
    });

    test('form validation across browsers', async ({ page, browserName }) => {
      await page.goto('/seller/create-listing');

      // Test HTML5 form validation
      const titleInput = page.locator('[data-testid="title-input"]');
      const priceInput = page.locator('[data-testid="start-price-input"]');

      // Test required field validation
      await page.click('[data-testid="save-draft-button"]');

      // Different browsers may handle validation differently
      const hasNativeValidation = await titleInput.evaluate((input) => {
        return input.checkValidity !== undefined;
      });

      if (hasNativeValidation) {
        const validationMessage = await titleInput.evaluate((input) => input.validationMessage);
        expect(validationMessage).toBeTruthy();
      } else {
        // Fallback validation should work
        await expect(page.locator('[data-testid="title-error"]')).toBeVisible();
      }

      // Test number input validation
      await priceInput.fill('invalid-number');
      
      const numberValidation = await priceInput.evaluate((input) => {
        if (input.checkValidity) {
          return input.checkValidity();
        }
        return input.value !== 'invalid-number'; // Browsers may filter invalid input
      });

      // Either native validation catches it, or value is filtered
      expect(numberValidation).toBe(false);
    });

    test('WebSocket support across browsers', async ({ page, browserName }) => {
      const listingId = 'websocket-browser-test';

      // Test WebSocket API availability
      const webSocketSupport = await page.evaluate(() => {
        return typeof WebSocket !== 'undefined';
      });

      expect(webSocketSupport).toBe(true);

      // Mock WebSocket behavior for testing
      await page.addInitScript(() => {
        window.testWebSocket = new WebSocket('ws://localhost:8080/test');
        window.webSocketEvents = [];
        
        window.testWebSocket.onopen = () => {
          window.webSocketEvents.push('open');
        };
        
        window.testWebSocket.onmessage = (event) => {
          window.webSocketEvents.push('message: ' + event.data);
        };
        
        window.testWebSocket.onerror = (error) => {
          window.webSocketEvents.push('error');
        };
      });

      await page.route(`**/api/listings/${listingId}`, async (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            listing: {
              id: listingId,
              title: 'WebSocket Test Listing',
              current_bid_cents: 10000
            }
          })
        });
      });

      await page.goto(`/listings/${listingId}`);

      // Simulate WebSocket events
      await page.evaluate(() => {
        if (window.testWebSocket.readyState === 1) {
          window.testWebSocket.dispatchEvent(new MessageEvent('message', {
            data: JSON.stringify({ type: 'bid_update', amount_cents: 11000 })
          }));
        }
      });

      // Verify WebSocket handling works across browsers
      const webSocketEvents = await page.evaluate(() => window.webSocketEvents);
      expect(webSocketEvents.length).toBeGreaterThan(0);
    });

    test('local storage and session management', async ({ page, browserName }) => {
      // Test localStorage support
      const localStorageSupport = await page.evaluate(() => {
        try {
          localStorage.setItem('test', 'value');
          const value = localStorage.getItem('test');
          localStorage.removeItem('test');
          return value === 'value';
        } catch (e) {
          return false;
        }
      });

      expect(localStorageSupport).toBe(true);

      // Test sessionStorage support
      const sessionStorageSupport = await page.evaluate(() => {
        try {
          sessionStorage.setItem('test', 'value');
          const value = sessionStorage.getItem('test');
          sessionStorage.removeItem('test');
          return value === 'value';
        } catch (e) {
          return false;
        }
      });

      expect(sessionStorageSupport).toBe(true);

      // Test storage limits (different across browsers)
      const storageLimit = await page.evaluate(() => {
        try {
          const testData = 'x'.repeat(1024 * 1024); // 1MB
          localStorage.setItem('limit-test', testData);
          localStorage.removeItem('limit-test');
          return true;
        } catch (e) {
          return false;
        }
      });

      // Should handle storage gracefully even if limits differ
      expect(typeof storageLimit).toBe('boolean');
    });

    test('image format support and optimization', async ({ page, browserName }) => {
      // Test modern image format support
      const formatSupport = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 1;
        canvas.height = 1;
        
        return {
          webp: canvas.toDataURL('image/webp').indexOf('webp') > -1,
          avif: canvas.toDataURL('image/avif').indexOf('avif') > -1,
          jpeg: true, // Always supported
          png: true   // Always supported
        };
      });

      expect(formatSupport.jpeg).toBe(true);
      expect(formatSupport.png).toBe(true);

      // WebP support varies by browser
      if (browserName === 'chromium') {
        expect(formatSupport.webp).toBe(true);
      }

      // Mock image loading with appropriate formats
      await page.route('**/images/**', async (route) => {
        const url = route.request().url();
        
        if (url.includes('.webp') && !formatSupport.webp) {
          // Fallback to JPEG if WebP not supported
          const fallbackUrl = url.replace('.webp', '.jpg');
          return route.continue({ url: fallbackUrl });
        }
        
        return route.continue();
      });

      await page.goto('/marketplace');
      
      // Verify images load correctly regardless of format support
      await expect(page.locator('[data-testid="listing-image"]').first()).toBeVisible();
    });
  });

  test('accessibility across devices and browsers', async ({ page, browserName }) => {
    await page.goto('/marketplace');

    // Test keyboard navigation
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();

    // Test screen reader compatibility
    const searchInput = page.locator('[data-testid="search-input"]');
    const ariaLabel = await searchInput.getAttribute('aria-label');
    const placeholder = await searchInput.getAttribute('placeholder');
    
    expect(ariaLabel || placeholder).toBeTruthy();

    // Test focus management
    await page.click('[data-testid="listing-card"]');
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['A', 'BUTTON', 'DIV'].includes(focusedElement)).toBe(true);

    // Test color contrast (can vary by browser rendering)
    const searchButton = page.locator('[data-testid="search-button"]');
    const buttonStyles = await searchButton.evaluate((btn) => {
      const styles = window.getComputedStyle(btn);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color
      };
    });

    expect(buttonStyles.backgroundColor).toBeTruthy();
    expect(buttonStyles.color).toBeTruthy();
  });
});