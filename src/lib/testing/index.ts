/**
 * MVP Backend Testing Infrastructure
 * Centralized exports for WebSocket and Authentication testing utilities
 */

// WebSocket Testing Infrastructure
export {
  WebSocketMockServer,
  WebSocketMockConnection,
  WebSocketTestUtils,
  type WebSocketMockOptions,
  type BidUpdateEvent,
  type AuctionStatusEvent,
  type ConnectionEvent,
  type WebSocketEvent
} from './websocket-testing-utils.js';

// Authentication Test Fixtures
export {
  authTestFixtures,
  AuthTestFixtures,
  type TestUser,
  type AuthTestSession,
  type AuthFlowTestCase,
  type UserRole,
  type KYCStatus,
  type AccountStatus
} from './auth-test-fixtures.js';

// Integration Helpers
export {
  MVPIntegrationHelpers,
  type MVPTestContext,
  type AuctionTestScenario,
  type AuthTestScenario
} from './mvp-integration-helpers.js';

// Test Runner
export {
  MVPTestRunner,
  type MVPTestConfig,
  type MVPTestResults
} from './mvp-test-runner.js';

// Re-export existing mock utilities for convenience
export { supabaseAuthMock } from '../mocks/supabase-auth-mock.js';

/**
 * Quick setup function for E2E tests
 */
export async function setupMVPTesting() {
  const { authTestFixtures } = await import('./auth-test-fixtures.js');
  const { WebSocketMockServer } = await import('./websocket-testing-utils.js');
  
  return {
    authFixtures: authTestFixtures,
    webSocketServer: new WebSocketMockServer(),
    cleanup: () => {
      authTestFixtures.reset();
    }
  };
}

/**
 * Common test data generators
 */
export const testDataGenerators = {
  /**
   * Create test auction data
   */
  auction: (overrides: any = {}) => ({
    id: `test-auction-${Date.now()}`,
    title: 'Test Auction Item',
    start_cents: 10000,
    current_bid_cents: 10000,
    minimum_bid_cents: 10100,
    reserve_cents: 20000,
    bid_count: 0,
    end_at: new Date(Date.now() + 3600000).toISOString(),
    status: 'active',
    seller_id: 'test-seller',
    ...overrides
  }),

  /**
   * Create test user data
   */
  user: (role: string = 'buyer', overrides: any = {}) => ({
    id: `test-${role}-${Date.now()}`,
    email: `${role}@test.com`,
    role,
    kyc_status: 'passed',
    account_status: 'active',
    permissions: role === 'admin' ? ['manage_all_users'] : ['view_listings'],
    ...overrides
  }),

  /**
   * Create test bid data
   */
  bid: (overrides: any = {}) => ({
    id: `test-bid-${Date.now()}`,
    listing_id: 'test-listing',
    bidder_id: 'test-bidder',
    amount_cents: 15000,
    created_at: new Date().toISOString(),
    ...overrides
  })
};

/**
 * Common test assertions
 */
export const testAssertions = {
  /**
   * Assert WebSocket connection is working
   */
  async webSocketConnected(connection: any): Promise<boolean> {
    const state = connection.getState();
    return state.connected === true;
  },

  /**
   * Assert user has required permissions
   */
  userHasPermissions(user: any, requiredPermissions: string[]): boolean {
    const userPermissions = user.permissions || [];
    return requiredPermissions.every(perm => userPermissions.includes(perm));
  },

  /**
   * Assert auction timing is accurate
   */
  auctionTimingAccurate(expectedEnd: Date, actualEnd: Date, toleranceMs: number = 1000): boolean {
    return Math.abs(expectedEnd.getTime() - actualEnd.getTime()) <= toleranceMs;
  }
};

export default {
  setupMVPTesting,
  testDataGenerators,
  testAssertions
};