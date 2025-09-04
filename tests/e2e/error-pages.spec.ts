import { test, expect } from '@playwright/test';

test('global 404 renders error page', async ({ page }) => {
  await page.goto('/this-route-does-not-exist');
  await expect(page.getByText('Page Not Found')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go Home' })).toBeVisible();
});


