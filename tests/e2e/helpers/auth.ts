import type { Page } from '@playwright/test';

export type TestSession = {
  user: { id: string; email?: string };
  access_token?: string;
  expires_at?: number;
};

export type UserRole = 'buyer' | 'seller' | 'admin';

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

/**
 * Sets up E2E authentication for common test user roles
 * @param page - Playwright page object
 * @param role - User role (buyer, seller, admin)
 */
export async function setupE2EAuth(page: Page, role: UserRole): Promise<void> {
  const testUsers: Record<UserRole, TestSession> = {
    buyer: {
      user: {
        id: 'test-buyer-1',
        email: 'buyer@test.com'
      },
      access_token: 'test-buyer-access-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600
    },
    seller: {
      user: {
        id: 'test-seller-1', 
        email: 'seller@test.com'
      },
      access_token: 'test-seller-access-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600
    },
    admin: {
      user: {
        id: 'test-admin-1',
        email: 'admin@test.com'
      },
      access_token: 'test-admin-access-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600
    }
  };

  const session = testUsers[role];
  if (!session) {
    throw new Error(`Unknown user role: ${role}`);
  }

  await loginAs(page, session);
}


