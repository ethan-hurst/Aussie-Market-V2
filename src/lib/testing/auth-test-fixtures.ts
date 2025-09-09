/**
 * Authentication Test Fixtures for MVP Testing
 * Provides comprehensive auth flow testing with various user states and permissions
 */

import { supabaseAuthMock, type MockUser } from '../mocks/supabase-auth-mock.js';

export type UserRole = 'buyer' | 'seller' | 'moderator' | 'admin';
export type KYCStatus = 'none' | 'pending' | 'passed' | 'failed' | 'expired';
export type AccountStatus = 'active' | 'suspended' | 'pending_verification' | 'closed';

export interface TestUser {
  id: string;
  email: string;
  password?: string;
  role: UserRole;
  kyc_status: KYCStatus;
  account_status: AccountStatus;
  phone?: string;
  legal_name?: string;
  dob?: string;
  address?: any;
  stripe_customer_id?: string;
  stripe_connect_account_id?: string;
  permissions: string[];
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface AuthTestSession {
  user: TestUser;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  session_id: string;
}

export interface AuthFlowTestCase {
  name: string;
  description: string;
  user: TestUser;
  expectedOutcome: 'success' | 'failure' | 'requires_verification';
  permissions: string[];
  restrictions?: string[];
}

export class AuthTestFixtures {
  private static instance: AuthTestFixtures;
  private userRegistry: Map<string, TestUser> = new Map();
  private sessionRegistry: Map<string, AuthTestSession> = new Map();
  private permissionGroups: Map<UserRole, string[]> = new Map();

  constructor() {
    this.initializePermissionGroups();
    this.seedTestUsers();
  }

  static getInstance(): AuthTestFixtures {
    if (!AuthTestFixtures.instance) {
      AuthTestFixtures.instance = new AuthTestFixtures();
    }
    return AuthTestFixtures.instance;
  }

  /**
   * Initialize permission groups for different user roles
   */
  private initializePermissionGroups(): void {
    this.permissionGroups.set('buyer', [
      'view_listings',
      'place_bids',
      'view_own_orders',
      'message_sellers',
      'leave_feedback',
      'view_own_profile',
      'update_own_profile'
    ]);

    this.permissionGroups.set('seller', [
      'view_listings',
      'create_listings',
      'manage_own_listings',
      'view_own_orders',
      'message_buyers',
      'manage_inventory',
      'view_seller_dashboard',
      'process_orders',
      'view_own_profile',
      'update_own_profile'
    ]);

    this.permissionGroups.set('moderator', [
      'view_all_listings',
      'moderate_listings',
      'moderate_users',
      'view_reports',
      'manage_disputes',
      'view_all_orders',
      'send_warnings',
      'temporary_suspend'
    ]);

    this.permissionGroups.set('admin', [
      'view_all_listings',
      'manage_all_listings',
      'manage_all_users',
      'view_all_orders',
      'manage_all_orders',
      'access_admin_panel',
      'manage_categories',
      'manage_system_settings',
      'view_analytics',
      'manage_finances',
      'permanent_ban'
    ]);
  }

  /**
   * Seed test users with various states for comprehensive testing
   */
  private seedTestUsers(): void {
    const testUsers: Partial<TestUser>[] = [
      // Standard verified buyer
      {
        id: 'test-buyer-verified',
        email: 'buyer.verified@test.com',
        password: 'TestPassword123!',
        role: 'buyer',
        kyc_status: 'passed',
        account_status: 'active',
        legal_name: 'John Buyer',
        phone: '+61400123456',
        stripe_customer_id: 'cus_test_buyer_verified'
      },

      // Buyer with pending KYC - should have limited permissions
      {
        id: 'test-buyer-pending-kyc',
        email: 'buyer.pending@test.com',
        password: 'TestPassword123!',
        role: 'buyer',
        kyc_status: 'pending',
        account_status: 'pending_verification',
        legal_name: 'Jane PendingBuyer'
      },

      // Buyer with failed KYC - should have no bid permissions  
      {
        id: 'test-buyer-failed-kyc',
        email: 'buyer.failed@test.com',
        password: 'TestPassword123!',
        role: 'buyer',
        kyc_status: 'failed',
        account_status: 'suspended',
        legal_name: 'Bob FailedBuyer'
      },

      // Standard verified seller
      {
        id: 'test-seller-verified',
        email: 'seller.verified@test.com',
        password: 'TestPassword123!',
        role: 'seller',
        kyc_status: 'passed',
        account_status: 'active',
        legal_name: 'Alice Seller',
        phone: '+61400654321',
        stripe_customer_id: 'cus_test_seller',
        stripe_connect_account_id: 'acct_test_seller_verified'
      },

      // Seller with pending verification
      {
        id: 'test-seller-pending',
        email: 'seller.pending@test.com',
        password: 'TestPassword123!',
        role: 'seller',
        kyc_status: 'pending',
        account_status: 'pending_verification',
        legal_name: 'Charlie PendingSeller'
      },

      // Moderator account
      {
        id: 'test-moderator',
        email: 'moderator@test.com',
        password: 'ModeratorPass123!',
        role: 'moderator',
        kyc_status: 'passed',
        account_status: 'active',
        legal_name: 'Diana Moderator'
      },

      // Admin account
      {
        id: 'test-admin',
        email: 'admin@test.com',
        password: 'AdminPass123!',
        role: 'admin',
        kyc_status: 'passed',
        account_status: 'active',
        legal_name: 'Eve Admin'
      },

      // Edge cases
      {
        id: 'test-expired-kyc',
        email: 'expired.kyc@test.com',
        password: 'TestPassword123!',
        role: 'seller',
        kyc_status: 'expired',
        account_status: 'suspended',
        legal_name: 'Frank ExpiredKYC'
      },

      {
        id: 'test-no-kyc',
        email: 'no.kyc@test.com',
        password: 'TestPassword123!',
        role: 'buyer',
        kyc_status: 'none',
        account_status: 'active',
        legal_name: 'Grace NoKYC'
      }
    ];

    testUsers.forEach(userData => {
      const user = this.createTestUser(userData);
      this.userRegistry.set(user.id, user);
    });
  }

  /**
   * Create a test user with proper defaults
   */
  createTestUser(userData: Partial<TestUser>): TestUser {
    const now = new Date().toISOString();
    const role = userData.role || 'buyer';
    const kyc_status = userData.kyc_status || 'none';
    const account_status = userData.account_status || 'active';
    
    // Get base permissions for role
    let permissions = [...(this.permissionGroups.get(role) || [])];
    
    // Filter permissions based on KYC status and account status
    if (kyc_status === 'pending' || kyc_status === 'failed' || account_status !== 'active') {
      // Remove sensitive permissions for unverified/suspended accounts
      permissions = permissions.filter(p => 
        !['place_bids', 'create_listings', 'manage_own_listings', 'process_orders'].includes(p)
      );
    }

    return {
      id: userData.id || `test-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      email: userData.email || `test-${Date.now()}@example.com`,
      password: userData.password,
      role,
      kyc_status,
      account_status,
      phone: userData.phone || null,
      legal_name: userData.legal_name || null,
      dob: userData.dob || null,
      address: userData.address || null,
      stripe_customer_id: userData.stripe_customer_id || null,
      stripe_connect_account_id: userData.stripe_connect_account_id || null,
      permissions,
      metadata: {
        test_user: true,
        created_by: 'auth-test-fixtures',
        ...userData.metadata
      },
      created_at: userData.created_at || now,
      updated_at: userData.updated_at || now
    };
  }

  /**
   * Get user by ID or email
   */
  getUser(identifier: string): TestUser | null {
    // Try by ID first
    let user = this.userRegistry.get(identifier);
    if (user) return user;

    // Try by email
    for (const testUser of this.userRegistry.values()) {
      if (testUser.email === identifier) {
        return testUser;
      }
    }

    return null;
  }

  /**
   * Get users by role
   */
  getUsersByRole(role: UserRole): TestUser[] {
    return Array.from(this.userRegistry.values())
      .filter(user => user.role === role);
  }

  /**
   * Get users by KYC status
   */
  getUsersByKYCStatus(kycStatus: KYCStatus): TestUser[] {
    return Array.from(this.userRegistry.values())
      .filter(user => user.kyc_status === kycStatus);
  }

  /**
   * Create authentication session for user
   */
  createSession(user: TestUser, expiresInSeconds: number = 3600): AuthTestSession {
    const now = Math.floor(Date.now() / 1000);
    const sessionId = `session-${user.id}-${Date.now()}`;
    
    const session: AuthTestSession = {
      user,
      access_token: `test-token-${user.id}-${Date.now()}`,
      refresh_token: `refresh-token-${user.id}-${Date.now()}`,
      expires_at: now + expiresInSeconds,
      session_id: sessionId
    };

    this.sessionRegistry.set(session.access_token, session);
    return session;
  }

  /**
   * Validate session token
   */
  validateSession(accessToken: string): AuthTestSession | null {
    const session = this.sessionRegistry.get(accessToken);
    if (!session) return null;

    // Check if expired (session.expires_at is in Unix timestamp seconds)
    const now = Math.floor(Date.now() / 1000);
    if (session.expires_at <= now) {
      this.sessionRegistry.delete(accessToken);
      return null;
    }

    return session;
  }

  /**
   * Generate auth flow test cases
   */
  generateAuthFlowTestCases(): AuthFlowTestCase[] {
    return [
      {
        name: 'verified_buyer_login',
        description: 'Verified buyer should be able to login and access buyer features',
        user: this.getUser('test-buyer-verified')!,
        expectedOutcome: 'success',
        permissions: ['view_listings', 'place_bids', 'view_own_orders']
      },
      {
        name: 'pending_kyc_login',
        description: 'User with pending KYC should login but have restricted access',
        user: this.getUser('test-buyer-pending-kyc')!,
        expectedOutcome: 'requires_verification',
        permissions: ['view_listings'],
        restrictions: ['place_bids', 'create_listings']
      },
      {
        name: 'failed_kyc_login',
        description: 'User with failed KYC should not be able to access restricted features',
        user: this.getUser('test-buyer-failed-kyc')!,
        expectedOutcome: 'failure',
        permissions: [],
        restrictions: ['place_bids', 'create_listings', 'view_own_orders']
      },
      {
        name: 'seller_verification_flow',
        description: 'Seller should complete verification before creating listings',
        user: this.getUser('test-seller-pending')!,
        expectedOutcome: 'requires_verification',
        permissions: ['view_listings'],
        restrictions: ['create_listings', 'manage_own_listings']
      },
      {
        name: 'admin_full_access',
        description: 'Admin should have access to all features',
        user: this.getUser('test-admin')!,
        expectedOutcome: 'success',
        permissions: ['view_all_listings', 'manage_all_users', 'access_admin_panel']
      },
      {
        name: 'moderator_limited_admin',
        description: 'Moderator should have limited admin access',
        user: this.getUser('test-moderator')!,
        expectedOutcome: 'success',
        permissions: ['moderate_listings', 'manage_disputes', 'view_reports'],
        restrictions: ['manage_system_settings', 'manage_finances']
      }
    ];
  }

  /**
   * Generate permission test scenarios
   */
  generatePermissionTestScenarios(): {
    role: UserRole;
    allowed_actions: string[];
    forbidden_actions: string[];
  }[] {
    return [
      {
        role: 'buyer',
        allowed_actions: ['view_listings', 'place_bids', 'view_own_orders'],
        forbidden_actions: ['create_listings', 'access_admin_panel', 'moderate_users']
      },
      {
        role: 'seller',
        allowed_actions: ['view_listings', 'create_listings', 'manage_own_listings'],
        forbidden_actions: ['access_admin_panel', 'moderate_users', 'manage_all_orders']
      },
      {
        role: 'moderator',
        allowed_actions: ['moderate_listings', 'manage_disputes', 'view_reports'],
        forbidden_actions: ['manage_finances', 'permanent_ban', 'manage_system_settings']
      },
      {
        role: 'admin',
        allowed_actions: ['access_admin_panel', 'manage_all_users', 'manage_finances'],
        forbidden_actions: [] // Admin has all permissions
      }
    ];
  }

  /**
   * Create JWT-like token for testing
   */
  createTestJWT(user: TestUser, expiresInSeconds: number = 3600): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({
      sub: user.id,
      email: user.email,
      role: user.role,
      kyc_status: user.kyc_status,
      account_status: user.account_status,
      permissions: user.permissions,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      iat: Math.floor(Date.now() / 1000),
      iss: 'aussie-market-test'
    }));
    const signature = 'test-signature';

    return `${header}.${payload}.${signature}`;
  }

  /**
   * Parse test JWT token
   */
  parseTestJWT(token: string): any | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = JSON.parse(atob(parts[1]));
      
      // Check if expired
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }

      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Generate browser script for auth testing
   */
  static getBrowserAuthScript(): string {
    return `
      // Authentication Mock for E2E Tests
      window.__AuthTestHelpers = {
        setUser: function(userId, token) {
          localStorage.setItem('auth-token', token);
          localStorage.setItem('user-id', userId);
          
          // Mock session data for Supabase client
          const mockSession = {
            user: { id: userId, email: 'test@example.com' },
            access_token: token,
            expires_at: Math.floor(Date.now() / 1000) + 3600
          };
          localStorage.setItem('sb-session', JSON.stringify(mockSession));
        },

        clearAuth: function() {
          localStorage.removeItem('auth-token');
          localStorage.removeItem('user-id');
          localStorage.removeItem('sb-session');
        },

        isAuthenticated: function() {
          return !!localStorage.getItem('auth-token');
        },

        getCurrentUser: function() {
          const token = localStorage.getItem('auth-token');
          if (!token) return null;

          try {
            const parts = token.split('.');
            const payload = JSON.parse(atob(parts[1]));
            return payload;
          } catch {
            return null;
          }
        },

        hasPermission: function(permission) {
          const user = this.getCurrentUser();
          return user && user.permissions && user.permissions.includes(permission);
        }
      };

      // Auto-restore auth state on page load
      if (localStorage.getItem('auth-token')) {
        console.log('[Auth Mock] Restored authentication state');
      }
    `;
  }

  /**
   * Reset all test data
   */
  reset(): void {
    this.userRegistry.clear();
    this.sessionRegistry.clear();
    this.seedTestUsers();
  }

  /**
   * Get test statistics
   */
  getStats(): {
    total_users: number;
    users_by_role: Record<UserRole, number>;
    users_by_kyc_status: Record<KYCStatus, number>;
    active_sessions: number;
  } {
    const usersByRole: Record<UserRole, number> = {
      buyer: 0,
      seller: 0,
      moderator: 0,
      admin: 0
    };

    const usersByKYC: Record<KYCStatus, number> = {
      none: 0,
      pending: 0,
      passed: 0,
      failed: 0,
      expired: 0
    };

    for (const user of this.userRegistry.values()) {
      usersByRole[user.role]++;
      usersByKYC[user.kyc_status]++;
    }

    return {
      total_users: this.userRegistry.size,
      users_by_role: usersByRole,
      users_by_kyc_status: usersByKYC,
      active_sessions: this.sessionRegistry.size
    };
  }
}

// Export singleton instance
export const authTestFixtures = AuthTestFixtures.getInstance();
export default authTestFixtures;