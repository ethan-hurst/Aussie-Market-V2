import type { Page, Locator } from '@playwright/test';

export const ui = {
  heroTitle: (page: Page): Locator => page.getByRole('heading', { name: "Australia's Premier C2C Auction Platform" }),
  startSelling: (page: Page): Locator => page.getByRole('link', { name: 'Start Selling' })
};


