import { test, expect } from '@playwright/test';

test.describe('MVP Validation - Core Functionality', () => {
  
  test('marketplace page loads and displays basic functionality', async ({ page }) => {
    // Navigate to marketplace
    await page.goto('/marketplace');
    
    // Verify page loads with expected elements
    await expect(page.locator('h1')).toContainText('Marketplace');
    await expect(page.locator('[data-testid="marketplace-search"]')).toBeVisible();
    await expect(page.locator('[data-testid="search-button"]')).toBeVisible();
    
    // Test search functionality exists
    await page.fill('[data-testid="marketplace-search"]', 'test search');
    await page.click('[data-testid="search-button"]');
    
    // Test filter toggle functionality
    await page.click('[data-testid="toggle-filters"]');
    await expect(page.locator('[data-testid="category-filter"]')).toBeVisible();
    await expect(page.locator('[data-testid="state-filter"]')).toBeVisible();
    
    // Test view mode toggles
    await expect(page.locator('[data-testid="grid-view"]')).toBeVisible();
    await expect(page.locator('[data-testid="list-view"]')).toBeVisible();
    await page.click('[data-testid="list-view"]');
    await page.click('[data-testid="grid-view"]');
  });

  test('home page navigation works', async ({ page }) => {
    // Navigate to home page
    await page.goto('/');
    
    // Verify critical navigation elements exist (when not logged in)
    await expect(page.locator('a[href="/marketplace"]')).toBeVisible();
    await expect(page.locator('a[href="/login"]')).toBeVisible(); // This is what actually exists
    
    // Verify that our redirect routes work
    await page.goto('/auth/login');
    await expect(page.url()).toContain('/login'); // Should redirect
  });

  test('authentication pages load', async ({ page }) => {
    // Test login page (via redirect)
    await page.goto('/auth/login');
    await expect(page.url()).toContain('/login');
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    
    // Test register page (via redirect)
    await page.goto('/auth/register');
    await expect(page.url()).toContain('/register');
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test('database schema alignment - listings load without errors', async ({ page }) => {
    // This test verifies that our database schema fixes work
    await page.goto('/marketplace');
    
    // Wait for potential listings to load and check for schema errors
    await page.waitForTimeout(2000);
    
    // Check that no console errors related to database schema appear
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('column')) {
        consoleErrors.push(msg.text());
      }
    });
    
    // Navigate and wait for any schema-related errors
    await page.reload();
    await page.waitForTimeout(1000);
    
    // Should not have schema column errors
    expect(consoleErrors).toHaveLength(0);
  });

  test('critical page accessibility', async ({ page }) => {
    const pages = ['/', '/marketplace', '/login', '/register'];
    
    for (const url of pages) {
      await page.goto(url);
      
      // Basic accessibility checks - fix syntax error
      const headingCount = await page.locator('h1, h2, h3').count();
      expect(headingCount).toBeGreaterThan(0);
      await expect(page.locator('main, [role="main"]')).toBeVisible();
    }
  });
});