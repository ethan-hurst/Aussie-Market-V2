import { test, expect } from '@playwright/test';

test.describe('MVP Production Performance and Load Testing', () => {

  test('page load performance under normal conditions', async ({ page }) => {
    // Track performance metrics
    const performanceMetrics = [];
    
    page.on('response', async (response) => {
      const timing = await response.timing();
      performanceMetrics.push({
        url: response.url(),
        status: response.status(),
        timing: timing
      });
    });

    // Test critical page load times
    const criticalPages = [
      { path: '/', name: 'Homepage' },
      { path: '/marketplace', name: 'Marketplace' },
      { path: '/listings/test-listing-perf', name: 'Listing Detail' },
      { path: '/auth/login', name: 'Login' },
      { path: '/seller/create-listing', name: 'Create Listing' }
    ];

    for (const pageTest of criticalPages) {
      const startTime = Date.now();
      
      // Mock API responses for consistent testing
      if (pageTest.path.includes('marketplace')) {
        await page.route('**/api/search**', async (route) => {
          await new Promise(resolve => setTimeout(resolve, 100)); // Simulate DB query time
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              listings: Array.from({ length: 20 }, (_, i) => ({
                id: `perf-listing-${i}`,
                title: `Performance Test Listing ${i}`,
                current_bid_cents: 5000 + (i * 100),
                end_at: new Date(Date.now() + 86400000).toISOString(),
                images: [{ url: `/images/test-${i}.jpg`, alt: `Test item ${i}` }]
              })),
              total: 100,
              page: 1
            })
          });
        });
      }

      if (pageTest.path.includes('test-listing-perf')) {
        await page.route('**/api/listings/test-listing-perf', async (route) => {
          await new Promise(resolve => setTimeout(resolve, 150)); // Simulate complex query
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              listing: {
                id: 'test-listing-perf',
                title: 'Performance Test Auction Item',
                description: 'A comprehensive description for performance testing purposes',
                current_bid_cents: 12500,
                minimum_bid_cents: 13000,
                reserve_cents: 20000,
                end_at: new Date(Date.now() + 3600000).toISOString(),
                images: Array.from({ length: 5 }, (_, i) => ({
                  url: `/images/perf-test-${i}.jpg`,
                  alt: `Performance test image ${i}`
                })),
                seller: { legal_name: 'Performance Test Seller', rating: 4.7 }
              }
            })
          });
        });

        await page.route('**/api/listings/test-listing-perf/bids', async (route) => {
          await new Promise(resolve => setTimeout(resolve, 75));
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              bids: Array.from({ length: 15 }, (_, i) => ({
                id: `bid-${i}`,
                amount_cents: 10000 + (i * 500),
                created_at: new Date(Date.now() - (i * 3600000)).toISOString()
              }))
            })
          });
        });
      }

      await page.goto(pageTest.path);
      await page.waitForLoadState('networkidle');
      
      const loadTime = Date.now() - startTime;
      
      // Performance assertions
      expect(loadTime).toBeLessThan(3000); // Page should load in under 3 seconds
      console.log(`${pageTest.name} load time: ${loadTime}ms`);

      // Check for Core Web Vitals
      const vitals = await page.evaluate(() => {
        return new Promise((resolve) => {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const vitalsData = {};
            
            for (const entry of entries) {
              if (entry.entryType === 'largest-contentful-paint') {
                vitalsData.LCP = entry.startTime;
              }
              if (entry.entryType === 'first-input') {
                vitalsData.FID = entry.processingStart - entry.startTime;
              }
              if (entry.entryType === 'layout-shift') {
                if (!vitalsData.CLS) vitalsData.CLS = 0;
                vitalsData.CLS += entry.value;
              }
            }
            
            resolve(vitalsData);
          }).observe({ entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift'] });

          // Timeout after 5 seconds
          setTimeout(() => resolve({}), 5000);
        });
      });

      // Core Web Vitals thresholds (good performance)
      if (vitals.LCP) expect(vitals.LCP).toBeLessThan(2500); // LCP < 2.5s
      if (vitals.FID) expect(vitals.FID).toBeLessThan(100);  // FID < 100ms
      if (vitals.CLS) expect(vitals.CLS).toBeLessThan(0.1);  // CLS < 0.1
    }
  });

  test('handles concurrent user load simulation', async ({ page, context }) => {
    // Simulate multiple concurrent users
    const userCount = 10;
    const userPages = [];
    const loadTestResults = [];

    // Create multiple browser pages
    for (let i = 0; i < userCount; i++) {
      const userPage = await context.newPage();
      userPages.push(userPage);
    }

    // Mock high-load API responses with realistic delays
    const setupLoadTestMocks = async (targetPage, userId) => {
      await targetPage.route('**/api/search**', async (route) => {
        // Simulate database load with variable response times
        const delay = 200 + Math.random() * 300;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            listings: Array.from({ length: 20 }, (_, i) => ({
              id: `load-test-${userId}-${i}`,
              title: `Load Test Item ${i}`,
              current_bid_cents: 5000 + (i * 100),
              end_at: new Date(Date.now() + 86400000).toISOString()
            }))
          })
        });
      });

      await targetPage.route('**/api/listings/*/bids', async (route) => {
        if (route.request().method() === 'POST') {
          // Simulate bid processing under load
          const delay = 500 + Math.random() * 500;
          await new Promise(resolve => setTimeout(resolve, delay));
          
          return route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              bid: { amount_cents: 15000 + Math.random() * 5000 }
            })
          });
        }
        return route.continue();
      });

      await targetPage.setExtraHTTPHeaders({ 'x-test-user-id': `load-test-user-${userId}` });
    };

    // Setup all user pages
    for (let i = 0; i < userCount; i++) {
      await setupLoadTestMocks(userPages[i], i);
    }

    // Simulate concurrent user actions
    const startTime = Date.now();
    
    const userPromises = userPages.map(async (userPage, index) => {
      const userStartTime = Date.now();
      
      try {
        // User journey: marketplace → listing detail → place bid
        await userPage.goto('/marketplace');
        await userPage.waitForLoadState('networkidle');
        
        const marketplaceLoadTime = Date.now() - userStartTime;
        
        // Click on first listing
        await userPage.click('[data-testid="listing-card"]:first-child');
        await userPage.waitForLoadState('networkidle');
        
        const listingLoadTime = Date.now() - userStartTime;
        
        // Place a bid
        await userPage.fill('[data-testid="bid-amount-input"]', `${150 + index}.00`);
        await userPage.click('[data-testid="place-bid-button"]');
        await userPage.click('[data-testid="confirm-bid-button"]');
        
        const bidPlacementTime = Date.now() - userStartTime;
        
        return {
          userId: index,
          marketplaceLoadTime,
          listingLoadTime,
          bidPlacementTime,
          success: true
        };
      } catch (error) {
        return {
          userId: index,
          error: error.message,
          success: false
        };
      }
    });

    const results = await Promise.all(userPromises);
    const totalTime = Date.now() - startTime;
    
    // Analyze results
    const successfulUsers = results.filter(r => r.success);
    const failedUsers = results.filter(r => !r.success);
    
    console.log(`Load test completed in ${totalTime}ms`);
    console.log(`Successful users: ${successfulUsers.length}/${userCount}`);
    console.log(`Failed users: ${failedUsers.length}`);
    
    // Performance assertions for concurrent load
    expect(successfulUsers.length).toBeGreaterThanOrEqual(userCount * 0.9); // 90% success rate
    
    const avgMarketplaceLoad = successfulUsers.reduce((sum, r) => sum + r.marketplaceLoadTime, 0) / successfulUsers.length;
    const avgListingLoad = successfulUsers.reduce((sum, r) => sum + r.listingLoadTime, 0) / successfulUsers.length;
    const avgBidPlacement = successfulUsers.reduce((sum, r) => sum + r.bidPlacementTime, 0) / successfulUsers.length;
    
    // Under concurrent load, allow higher thresholds but still reasonable
    expect(avgMarketplaceLoad).toBeLessThan(5000); // 5s average marketplace load
    expect(avgListingLoad).toBeLessThan(7000);     // 7s average listing load  
    expect(avgBidPlacement).toBeLessThan(10000);   // 10s average bid placement
    
    console.log(`Average marketplace load: ${avgMarketplaceLoad}ms`);
    console.log(`Average listing load: ${avgListingLoad}ms`);
    console.log(`Average bid placement: ${avgBidPlacement}ms`);
    
    // Cleanup user pages
    await Promise.all(userPages.map(p => p.close()));
  });

  test('memory usage and resource optimization', async ({ page }) => {
    // Monitor memory usage during navigation
    const memoryReadings = [];
    
    const measureMemory = async (label) => {
      const memoryInfo = await page.evaluate(() => {
        return {
          usedJSHeapSize: performance.memory?.usedJSHeapSize || 0,
          totalJSHeapSize: performance.memory?.totalJSHeapSize || 0,
          jsHeapSizeLimit: performance.memory?.jsHeapSizeLimit || 0
        };
      });
      
      memoryReadings.push({ label, ...memoryInfo, timestamp: Date.now() });
      console.log(`Memory ${label}: ${(memoryInfo.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`);
    };

    // Mock APIs with large datasets to test memory handling
    await page.route('**/api/search**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          listings: Array.from({ length: 100 }, (_, i) => ({
            id: `memory-test-${i}`,
            title: `Memory Test Listing ${i}`,
            description: 'A' + 'a'.repeat(1000), // Large description
            current_bid_cents: 5000 + (i * 100),
            end_at: new Date(Date.now() + 86400000).toISOString(),
            images: Array.from({ length: 3 }, (_, j) => ({
              url: `/images/memory-test-${i}-${j}.jpg`,
              alt: `Memory test image ${i}-${j}`
            }))
          })),
          total: 1000
        })
      });
    });

    await measureMemory('initial');
    
    // Navigate through memory-intensive operations
    await page.goto('/marketplace');
    await page.waitForLoadState('networkidle');
    await measureMemory('marketplace-loaded');
    
    // Scroll through listings (virtual scrolling test)
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(500);
    }
    await measureMemory('after-scrolling');
    
    // Navigate to multiple listing details
    for (let i = 0; i < 5; i++) {
      await page.click(`[data-testid="listing-card"]:nth-child(${i + 1})`);
      await page.waitForLoadState('networkidle');
      await page.goBack();
      await page.waitForLoadState('networkidle');
    }
    await measureMemory('after-navigation');
    
    // Force garbage collection if available
    await page.evaluate(() => {
      if (window.gc) {
        window.gc();
      }
    });
    await measureMemory('after-gc');
    
    // Memory leak detection
    const initialMemory = memoryReadings[0].usedJSHeapSize;
    const finalMemory = memoryReadings[memoryReadings.length - 1].usedJSHeapSize;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Memory should not increase by more than 50MB during normal operation
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    
    // Check for excessive memory growth during operations
    const maxMemory = Math.max(...memoryReadings.map(r => r.usedJSHeapSize));
    expect(maxMemory).toBeLessThan(200 * 1024 * 1024); // Max 200MB usage
  });

  test('network resource optimization', async ({ page }) => {
    const resourceMetrics = {
      totalRequests: 0,
      totalBytes: 0,
      images: { count: 0, bytes: 0 },
      scripts: { count: 0, bytes: 0 },
      stylesheets: { count: 0, bytes: 0 },
      api: { count: 0, bytes: 0 }
    };

    page.on('response', async (response) => {
      const contentType = response.headers()['content-type'] || '';
      const contentLength = parseInt(response.headers()['content-length'] || '0');
      
      resourceMetrics.totalRequests++;
      resourceMetrics.totalBytes += contentLength;
      
      if (contentType.startsWith('image/')) {
        resourceMetrics.images.count++;
        resourceMetrics.images.bytes += contentLength;
      } else if (contentType.includes('javascript')) {
        resourceMetrics.scripts.count++;
        resourceMetrics.scripts.bytes += contentLength;
      } else if (contentType.includes('css')) {
        resourceMetrics.stylesheets.count++;
        resourceMetrics.stylesheets.bytes += contentLength;
      } else if (response.url().includes('/api/')) {
        resourceMetrics.api.count++;
        resourceMetrics.api.bytes += contentLength;
      }
    });

    // Mock optimized API responses
    await page.route('**/api/search**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          listings: Array.from({ length: 20 }, (_, i) => ({
            id: `opt-${i}`,
            title: `Optimized Listing ${i}`,
            current_bid_cents: 5000 + (i * 100),
            thumbnail_url: `/thumbnails/opt-${i}.webp`, // Optimized images
            end_at: new Date(Date.now() + 86400000).toISOString()
          }))
        }),
        headers: {
          'content-length': '2048', // Mock content length
          'cache-control': 'public, max-age=300' // 5-minute cache
        }
      });
    });

    await page.goto('/marketplace');
    await page.waitForLoadState('networkidle');
    
    // Resource optimization assertions
    console.log('Resource Metrics:', resourceMetrics);
    
    // Reasonable limits for MVP
    expect(resourceMetrics.totalRequests).toBeLessThan(50); // Max 50 requests per page
    expect(resourceMetrics.totalBytes).toBeLessThan(5 * 1024 * 1024); // Max 5MB total
    expect(resourceMetrics.images.bytes).toBeLessThan(2 * 1024 * 1024); // Max 2MB images
    expect(resourceMetrics.scripts.bytes).toBeLessThan(1 * 1024 * 1024); // Max 1MB scripts
  });

  test('error handling under high load conditions', async ({ page }) => {
    let apiCallCount = 0;
    const maxCallsBeforeFailure = 15;
    
    // Simulate API degradation under load
    await page.route('**/api/**', async (route) => {
      apiCallCount++;
      
      // Simulate intermittent failures under high load
      if (apiCallCount > maxCallsBeforeFailure && Math.random() < 0.3) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Service temporarily unavailable' }),
          headers: { 'retry-after': '5' }
        });
      }
      
      // Simulate slow responses under load
      const delay = Math.min(apiCallCount * 50, 2000);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: 'mock response', call_count: apiCallCount })
      });
    });

    // Test error resilience
    await page.goto('/marketplace');
    
    // Perform rapid actions to trigger high load
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('F5'); // Rapid refresh
      await page.waitForTimeout(100);
    }
    
    // Should show error boundary or graceful degradation
    const hasError = await page.locator('[data-testid="error-boundary"]').isVisible().catch(() => false);
    const hasLoading = await page.locator('[data-testid="loading-spinner"]').isVisible().catch(() => false);
    const hasRetry = await page.locator('[data-testid="retry-button"]').isVisible().catch(() => false);
    
    // At least one error handling mechanism should be present
    expect(hasError || hasLoading || hasRetry).toBe(true);
    
    // If retry button present, test retry functionality
    if (hasRetry) {
      await page.click('[data-testid="retry-button"]');
      await page.waitForLoadState('networkidle');
      
      // Should eventually recover
      await expect(page.locator('[data-testid="marketplace-content"]')).toBeVisible({ timeout: 10000 });
    }
  });
});