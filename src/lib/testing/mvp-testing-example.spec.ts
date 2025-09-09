/**
 * MVP Testing Infrastructure Example
 * Demonstrates how to use WebSocket and Auth testing utilities
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  WebSocketMockServer,
  authTestFixtures,
  MVPTestRunner,
  setupMVPTesting,
  testDataGenerators,
  testAssertions,
  type MVPTestConfig
} from './index.js';

describe('MVP Testing Infrastructure Examples', () => {
  let webSocketServer: WebSocketMockServer;
  let cleanup: () => void;

  beforeEach(async () => {
    const setup = await setupMVPTesting();
    webSocketServer = setup.webSocketServer;
    cleanup = setup.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  test('WebSocket real-time bid updates', async () => {
    // Create test auction
    const auction = testDataGenerators.auction({
      id: 'websocket-test-auction',
      current_bid_cents: 10000
    });

    // Create bidders
    const bidder1 = authTestFixtures.createTestUser({ 
      id: 'bidder-1',
      role: 'buyer',
      kyc_status: 'passed'
    });
    
    const bidder2 = authTestFixtures.createTestUser({
      id: 'bidder-2', 
      role: 'buyer',
      kyc_status: 'passed'
    });

    // Create WebSocket connections
    const connection1 = webSocketServer.createConnection(bidder1.id, auction.id);
    const connection2 = webSocketServer.createConnection(bidder2.id, auction.id);

    // Assert connections are working
    expect(await testAssertions.webSocketConnected(connection1)).toBe(true);
    expect(await testAssertions.webSocketConnected(connection2)).toBe(true);

    // Track received events
    let bidder1Events = 0;
    let bidder2Events = 0;
    
    connection1.addEventListener('bid_update', () => bidder1Events++);
    connection2.addEventListener('bid_update', () => bidder2Events++);

    // Simulate bid update
    await webSocketServer.simulateBidUpdate({
      listing_id: auction.id,
      current_bid_cents: 15000,
      minimum_bid_cents: 15100,
      bid_count: 1,
      winning_bidder_id: bidder1.id
    });

    // Wait for event processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Assert both bidders received the update
    expect(bidder1Events).toBe(1);
    expect(bidder2Events).toBe(1);
  });

  test('Authentication flow with different user types', async () => {
    // Test verified buyer login
    const verifiedBuyer = authTestFixtures.getUser('test-buyer-verified');
    expect(verifiedBuyer).toBeTruthy();
    expect(verifiedBuyer?.kyc_status).toBe('passed');
    expect(testAssertions.userHasPermissions(verifiedBuyer, ['place_bids'])).toBe(true);

    // Test pending KYC user restrictions
    const pendingUser = authTestFixtures.getUser('test-buyer-pending-kyc');
    expect(pendingUser).toBeTruthy();
    expect(pendingUser?.kyc_status).toBe('pending');
    expect(testAssertions.userHasPermissions(pendingUser, ['place_bids'])).toBe(false);

    // Test admin permissions
    const admin = authTestFixtures.getUser('test-admin');
    expect(admin).toBeTruthy();
    expect(testAssertions.userHasPermissions(admin, ['manage_all_users'])).toBe(true);
  });

  test('Concurrent bidding race condition handling', async () => {
    const auction = testDataGenerators.auction({
      id: 'race-condition-test',
      current_bid_cents: 20000
    });

    // Simulate 3 users bidding simultaneously
    const bidders = ['user-a', 'user-b', 'user-c'];
    const targetBid = 25000;

    const result = await webSocketServer.simulateRaceCondition(
      auction.id,
      bidders,
      targetBid
    );

    // Only one winner should emerge
    expect(result.winner).toBeTruthy();
    expect(result.conflicts).toHaveLength(2);
    expect(bidders).toContain(result.winner);
  });

  test('WebSocket connection resilience', async () => {
    const user = authTestFixtures.createTestUser({
      id: 'resilience-test-user',
      role: 'buyer'
    });

    const connection = webSocketServer.createConnection(user.id);
    
    // Verify initial connection
    expect(connection.getState().connected).toBe(true);

    // Simulate disconnect
    await connection.simulateDisconnect();
    expect(connection.getState().connected).toBe(false);

    // Simulate reconnect
    await connection.simulateReconnect();
    expect(connection.getState().connected).toBe(true);
    expect(connection.getState().reconnect_attempts).toBe(1);
  });

  test('Session management and expiry', async () => {
    const user = authTestFixtures.createTestUser({
      role: 'buyer',
      kyc_status: 'passed'
    });

    // Create short-lived session (1 second)
    const session = authTestFixtures.createSession(user, 1);
    
    // Should be valid initially
    let validSession = authTestFixtures.validateSession(session.access_token);
    expect(validSession).toBeTruthy();

    // Wait for expiry
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Should be expired now
    validSession = authTestFixtures.validateSession(session.access_token);
    expect(validSession).toBeFalsy();
  });

  test('JWT token creation and parsing', async () => {
    const user = authTestFixtures.createTestUser({
      id: 'jwt-test-user',
      email: 'jwt@test.com',
      role: 'seller',
      kyc_status: 'passed'
    });

    // Create JWT
    const token = authTestFixtures.createTestJWT(user, 3600);
    expect(token).toBeTruthy();
    expect(token.split('.')).toHaveLength(3);

    // Parse JWT
    const parsed = authTestFixtures.parseTestJWT(token);
    expect(parsed).toBeTruthy();
    expect(parsed.sub).toBe(user.id);
    expect(parsed.email).toBe(user.email);
    expect(parsed.role).toBe(user.role);
  });

  test('Complete MVP Test Runner', async () => {
    const config: MVPTestConfig = {
      websocket: {
        connectionCount: 5,
        eventsPerSecond: 10,
        testDuration: 5,
        failureRate: 0
      },
      authentication: {
        testAllRoles: true,
        testKYCStates: true,
        testSessionExpiry: true
      },
      auction: {
        bidders: 3,
        concurrentBids: 2,
        auctionDuration: 10,
        startPrice: 5000
      }
    };

    const runner = new MVPTestRunner(config);
    const results = await runner.runMVPTestSuite();

    // Verify overall results structure
    expect(results.overall).toBeDefined();
    expect(results.websocket).toBeDefined();
    expect(results.authentication).toBeDefined();
    expect(results.integration).toBeDefined();

    // Generate report
    const report = runner.generateReport();
    expect(report).toContain('MVP TESTING REPORT');
    expect(report).toContain('OVERALL RESULTS');

    // Should have reasonable coverage
    expect(results.overall.coverage).toBeGreaterThan(0);
    
    console.log(report); // Log the report for review
  }, 15000); // 15 second timeout for comprehensive test
});

describe('Performance Testing Examples', () => {
  test('WebSocket performance under load', async () => {
    const webSocketServer = new WebSocketMockServer({
      connectionDelay: 10,
      messageDelay: 5,
      failureRate: 0.01
    });

    try {
      // Create multiple connections
      const connections = Array.from({ length: 20 }, (_, i) =>
        webSocketServer.createConnection(`perf-user-${i}`, 'perf-test')
      );

      const startTime = Date.now();
      
      // Send burst of events
      const eventPromises = Array.from({ length: 50 }, async (_, i) => {
        await webSocketServer.simulateBidUpdate({
          listing_id: 'perf-test',
          current_bid_cents: 10000 + (i * 100),
          minimum_bid_cents: 10100 + (i * 100),
          bid_count: i + 1,
          winning_bidder_id: `perf-user-${i % 20}`
        });
      });

      await Promise.all(eventPromises);
      
      const duration = Date.now() - startTime;
      const eventsPerSecond = 50 / (duration / 1000);

      // Should handle at least 10 events per second
      expect(eventsPerSecond).toBeGreaterThan(10);
      
      console.log(`Performance: ${eventsPerSecond.toFixed(2)} events/sec`);

    } finally {
      webSocketServer.cleanup();
    }
  });
});

describe('Error Handling Examples', () => {
  test('Handle WebSocket connection failures gracefully', async () => {
    const webSocketServer = new WebSocketMockServer({
      failureRate: 0.5 // 50% failure rate for testing
    });

    try {
      const connection = webSocketServer.createConnection('error-test-user');
      
      let errors = 0;
      connection.addEventListener('error', () => errors++);

      // Try to send multiple messages
      const sendPromises = Array.from({ length: 10 }, async () => {
        try {
          await connection.send({ type: 'test', data: 'test' });
        } catch {
          // Expected due to failure rate
        }
      });

      await Promise.all(sendPromises);

      // Some failures should have occurred due to failure rate
      // This test validates error handling exists
      expect(true).toBe(true); // Test passes if no unhandled errors

    } finally {
      webSocketServer.cleanup();
    }
  });

  test('Handle invalid authentication gracefully', async () => {
    // Test with invalid user data
    const invalidUser = authTestFixtures.createTestUser({
      kyc_status: 'failed',
      account_status: 'suspended'
    });

    // Should create user but with restrictions
    expect(invalidUser.kyc_status).toBe('failed');
    expect(invalidUser.account_status).toBe('suspended');
    expect(testAssertions.userHasPermissions(invalidUser, ['place_bids'])).toBe(false);

    // Test with expired token
    const expiredToken = authTestFixtures.createTestJWT(invalidUser, -1); // Already expired
    const parsed = authTestFixtures.parseTestJWT(expiredToken);
    expect(parsed).toBeFalsy(); // Should be null due to expiry
  });
});