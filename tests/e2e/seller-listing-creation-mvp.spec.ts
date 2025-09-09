import { test, expect } from '@playwright/test';

test.describe('MVP Seller Listing Creation Flow', () => {
  
  test('complete seller onboarding and listing creation workflow', async ({ page }) => {
    // Test data setup
    const sellerId = 'mvp-seller-test';
    const listingId = 'mvp-listing-001';
    const testListing = {
      title: 'MVP Test Vintage Camera',
      description: 'Professional vintage camera in excellent condition for MVP testing',
      category: 'Electronics',
      subcategory: 'Cameras',
      startPrice: '150.00',
      reservePrice: '200.00',
      duration: '7' // days
    };

    // Mock API responses for seller registration and listing creation
    await page.route('**/api/auth/register', async (route) => {
      const body = route.request().postDataJSON();
      if (body?.email && body?.password) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            user: { id: sellerId, email: body.email, role: 'seller', verified: true }
          })
        });
      }
      return route.continue();
    });

    await page.route('**/api/listings', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            listing: { id: listingId, ...body, status: 'draft', seller_id: sellerId }
          })
        });
      }
      return route.continue();
    });

    await page.route(`**/api/listings/${listingId}/publish`, async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            listing: { id: listingId, status: 'active', published_at: new Date().toISOString() }
          })
        });
      }
      return route.continue();
    });

    await page.route('**/api/categories', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          categories: [
            { id: 'electronics', name: 'Electronics', subcategories: [{ id: 'cameras', name: 'Cameras' }] }
          ]
        })
      });
    });

    // 1. Seller Registration Flow
    await page.goto('/register?role=seller');
    await expect(page.locator('h1')).toContainText('Seller Registration');
    
    await page.fill('[data-testid="email-input"]', 'mvp-seller@test.com');
    await page.fill('[data-testid="password-input"]', 'SecurePassword123!');
    await page.fill('[data-testid="legal-name-input"]', 'MVP Test Seller');
    await page.fill('[data-testid="business-name-input"]', 'MVP Testing Co');
    
    await page.click('[data-testid="register-button"]');
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();

    // 2. Navigate to Listing Creation
    await page.goto('/seller/create-listing');
    await expect(page.locator('h1')).toContainText('Create New Listing');

    // 3. Fill Basic Listing Information
    await page.fill('[data-testid="title-input"]', testListing.title);
    await page.fill('[data-testid="description-textarea"]', testListing.description);
    
    // Category selection
    await page.selectOption('[data-testid="category-select"]', 'electronics');
    await page.selectOption('[data-testid="subcategory-select"]', 'cameras');

    // 4. Pricing Configuration
    await page.fill('[data-testid="start-price-input"]', testListing.startPrice);
    await page.fill('[data-testid="reserve-price-input"]', testListing.reservePrice);
    
    // Auction duration
    await page.selectOption('[data-testid="duration-select"]', testListing.duration);

    // 5. Image Upload Simulation (mock file upload)
    await page.route('**/api/upload/images', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          images: [
            { id: 'img1', url: '/test-images/camera-1.jpg', order: 0 },
            { id: 'img2', url: '/test-images/camera-2.jpg', order: 1 }
          ]
        })
      });
    });

    // Simulate file upload
    const fileInput = page.locator('[data-testid="image-upload-input"]');
    await fileInput.setInputFiles([{
      name: 'camera-main.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-image-data')
    }]);

    await expect(page.locator('[data-testid="uploaded-image"]')).toBeVisible();

    // 6. Save as Draft
    await page.click('[data-testid="save-draft-button"]');
    await expect(page.locator('[data-testid="draft-saved-message"]')).toBeVisible();

    // 7. Preview Listing
    await page.click('[data-testid="preview-listing-button"]');
    await expect(page.locator('[data-testid="listing-preview"]')).toBeVisible();
    await expect(page.locator('[data-testid="preview-title"]')).toContainText(testListing.title);
    await expect(page.locator('[data-testid="preview-price"]')).toContainText(testListing.startPrice);

    // 8. Publish Listing
    await page.click('[data-testid="publish-listing-button"]');
    await expect(page.locator('[data-testid="publish-confirmation-modal"]')).toBeVisible();
    await page.click('[data-testid="confirm-publish-button"]');
    
    // 9. Verify Publication Success
    await expect(page.locator('[data-testid="listing-published-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="listing-status"]')).toContainText('Active');

    // 10. Verify Listing Visibility (redirect to marketplace)
    await page.goto('/marketplace');
    await expect(page.locator(`[data-testid="listing-${listingId}"]`)).toBeVisible();
  });

  test('handles listing creation errors gracefully', async ({ page }) => {
    // Test error scenarios: missing required fields, invalid pricing, upload failures
    await page.goto('/seller/create-listing');

    // Try to save without required fields
    await page.click('[data-testid="save-draft-button"]');
    await expect(page.locator('[data-testid="title-error"]')).toContainText('Title is required');
    await expect(page.locator('[data-testid="description-error"]')).toContainText('Description is required');

    // Test invalid pricing
    await page.fill('[data-testid="start-price-input"]', '-50');
    await page.fill('[data-testid="reserve-price-input"]', '25');
    await page.click('[data-testid="validate-pricing-button"]');
    
    await expect(page.locator('[data-testid="start-price-error"]')).toContainText('Start price must be positive');
    await expect(page.locator('[data-testid="reserve-price-error"]')).toContainText('Reserve price must be higher than start price');
  });

  test('handles draft restoration correctly', async ({ page }) => {
    const draftData = {
      title: 'Draft Test Item',
      description: 'Test description',
      start_price_cents: 5000,
      reserve_price_cents: 7500
    };

    // Mock draft retrieval
    await page.route('**/api/listings/drafts', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ drafts: [{ id: 'draft-1', ...draftData }] })
      });
    });

    await page.route('**/api/listings/draft-1', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ listing: { id: 'draft-1', ...draftData } })
      });
    });

    await page.goto('/seller/create-listing');
    
    // Check for draft restoration prompt
    await expect(page.locator('[data-testid="draft-restoration-banner"]')).toBeVisible();
    await page.click('[data-testid="restore-draft-button"]');

    // Verify draft data is loaded
    await expect(page.locator('[data-testid="title-input"]')).toHaveValue(draftData.title);
    await expect(page.locator('[data-testid="description-textarea"]')).toHaveValue(draftData.description);
  });

  test('mobile responsive listing creation', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-specific test');
    
    await page.goto('/seller/create-listing');
    
    // Verify mobile layout
    await expect(page.locator('[data-testid="mobile-listing-form"]')).toBeVisible();
    
    // Test touch interactions
    await page.tap('[data-testid="category-select"]');
    await expect(page.locator('[data-testid="category-options"]')).toBeVisible();
    
    // Test mobile image upload
    await page.tap('[data-testid="mobile-camera-button"]');
    await expect(page.locator('[data-testid="camera-options-modal"]')).toBeVisible();
  });
});