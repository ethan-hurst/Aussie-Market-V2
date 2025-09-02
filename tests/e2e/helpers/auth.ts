import type { Page } from '@playwright/test';

export type TestSession = {
  user: { id: string; email?: string };
  access_token?: string;
  expires_at?: number;
};

// NOTE: This sets a generic session payload in localStorage prior to app load.
// If your app expects a specific Supabase key format, adjust the storage key to match.
export async function loginAs(page: Page, session: TestSession) {
  const payload = {
    access_token: session.access_token || 'test-access-token',
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + 3600,
    user: session.user
  };
  await page.addInitScript((s) => {
    try {
      localStorage.setItem('sb-session', JSON.stringify(s));
    } catch {}
  }, payload);
}


