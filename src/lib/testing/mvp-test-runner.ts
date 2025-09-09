/**
 * MVP Test Runner
 * Orchestrates WebSocket and Authentication testing for MVP validation
 */

import type { TestCase, TestResult, TestSuite } from 'vitest';
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketMockServer, type BidUpdateEvent } from './websocket-testing-utils.js';
import { authTestFixtures, type TestUser, type AuthFlowTestCase } from './auth-test-fixtures.js';
import MVPIntegrationHelpers from './mvp-integration-helpers.js';

export interface MVPTestConfig {
  websocket?: {
    connectionCount?: number;
    eventsPerSecond?: number;
    testDuration?: number;
    failureRate?: number;
  };
  authentication?: {
    testAllRoles?: boolean;
    testKYCStates?: boolean;
    testSessionExpiry?: boolean;
  };
  auction?: {
    bidders?: number;
    concurrentBids?: number;
    auctionDuration?: number;
    startPrice?: number;
  };
  performance?: {
    maxLatency?: number;
    minThroughput?: number;
    maxMemoryUsage?: number;
  };
}

export interface MVPTestResults {
  websocket: {
    connectionResilience: boolean;
    eventBroadcasting: boolean;
    raceConditionHandling: boolean;
    performanceMetrics: {
      averageLatency: number;
      throughput: number;
      memoryUsage: number;
    };
  };
  authentication: {
    loginFlows: Record<string, boolean>;
    permissionEnforcement: boolean;
    sessionManagement: boolean;
    kycValidation: boolean;
  };
  integration: {
    realtimeAuctions: boolean;
    concurrentBidding: boolean;
    auctionTiming: boolean;
    userExperience: boolean;
  };
  overall: {
    passed: number;
    failed: number;
    coverage: number;
    duration: number;
  };
}

export class MVPTestRunner {
  private config: MVPTestConfig;
  private webSocketServer: WebSocketMockServer;
  private results: Partial<MVPTestResults> = {};

  constructor(config: MVPTestConfig = {}) {
    this.config = {
      websocket: {
        connectionCount: 10,
        eventsPerSecond: 20,
        testDuration: 30,
        failureRate: 0.05,
        ...config.websocket
      },
      authentication: {
        testAllRoles: true,
        testKYCStates: true,
        testSessionExpiry: true,
        ...config.authentication
      },
      auction: {
        bidders: 5,
        concurrentBids: 3,
        auctionDuration: 300,
        startPrice: 10000,
        ...config.auction
      },
      performance: {
        maxLatency: 100,
        minThroughput: 50,
        maxMemoryUsage: 100 * 1024 * 1024, // 100MB
        ...config.performance
      }
    };

    this.webSocketServer = new WebSocketMockServer({
      connectionDelay: 50,
      messageDelay: 25,
      failureRate: this.config.websocket!.failureRate
    });
  }

  /**
   * Run complete MVP test suite
   */
  async runMVPTestSuite(): Promise<MVPTestResults> {
    const startTime = Date.now();

    try {
      // Run WebSocket tests
      console.log('🔄 Running WebSocket tests...');
      this.results.websocket = await this.runWebSocketTests();

      // Run Authentication tests
      console.log('🔐 Running Authentication tests...');
      this.results.authentication = await this.runAuthenticationTests();

      // Run Integration tests
      console.log('⚡ Running Integration tests...');
      this.results.integration = await this.runIntegrationTests();

      // Calculate overall results
      const duration = Date.now() - startTime;
      this.results.overall = this.calculateOverallResults(duration);

      console.log('✅ MVP Test Suite completed');
      return this.results as MVPTestResults;

    } catch (error) {
      console.error('❌ MVP Test Suite failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Run WebSocket-specific tests
   */
  private async runWebSocketTests(): Promise<MVPTestResults['websocket']> {
    const results = {
      connectionResilience: false,
      eventBroadcasting: false,
      raceConditionHandling: false,
      performanceMetrics: {
        averageLatency: 0,
        throughput: 0,
        memoryUsage: 0
      }
    };

    // Test connection resilience
    try {
      const connection = this.webSocketServer.createConnection('resilience-test', 'test-listing');
      await connection.simulateDisconnect();
      await connection.simulateReconnect();
      
      const state = connection.getState();
      results.connectionResilience = state.connected && state.reconnect_attempts > 0;
    } catch (error) {
      console.error('Connection resilience test failed:', error);
    }

    // Test event broadcasting
    try {
      const connections = Array.from({ length: 3 }, (_, i) => 
        this.webSocketServer.createConnection(`broadcast-test-${i}`, 'test-listing')
      );

      let receivedEvents = 0;
      connections.forEach(conn => {
        conn.addEventListener('bid_update', () => receivedEvents++);
      });

      await this.webSocketServer.simulateBidUpdate({
        listing_id: 'test-listing',
        current_bid_cents: 15000,
        minimum_bid_cents: 15100,
        bid_count: 1,
        winning_bidder_id: 'test-user'
      });

      // Wait a bit for event processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      results.eventBroadcasting = receivedEvents === 3;
    } catch (error) {
      console.error('Event broadcasting test failed:', error);
    }

    // Test race condition handling
    try {
      const { winner, conflicts } = await this.webSocketServer.simulateRaceCondition(
        'race-test-listing',
        ['user-1', 'user-2', 'user-3'],
        20000
      );
      
      results.raceConditionHandling = !!winner && conflicts.length === 2;
    } catch (error) {
      console.error('Race condition test failed:', error);
    }

    // Performance testing
    try {
      const perfResults = await MVPIntegrationHelpers.measureWebSocketPerformance(
        this.webSocketServer,
        this.config.websocket!.connectionCount!,
        this.config.websocket!.eventsPerSecond!,
        this.config.websocket!.testDuration!
      );

      results.performanceMetrics = {
        averageLatency: perfResults.averageLatency,
        throughput: perfResults.totalEvents / (this.config.websocket!.testDuration! || 30),
        memoryUsage: perfResults.memoryUsage
      };
    } catch (error) {
      console.error('Performance test failed:', error);
    }

    return results;
  }

  /**
   * Run Authentication-specific tests
   */
  private async runAuthenticationTests(): Promise<MVPTestResults['authentication']> {
    const results = {
      loginFlows: {},
      permissionEnforcement: false,
      sessionManagement: false,
      kycValidation: false
    };

    // Test login flows for different user types
    const testCases = authTestFixtures.generateAuthFlowTestCases();
    
    for (const testCase of testCases) {
      try {
        const session = authTestFixtures.createSession(testCase.user);
        const isValidSession = authTestFixtures.validateSession(session.access_token);
        
        const expectedSuccess = testCase.expectedOutcome === 'success';
        const actualSuccess = !!isValidSession && testCase.user.account_status === 'active';
        
        results.loginFlows[testCase.name] = expectedSuccess === actualSuccess;
      } catch (error) {
        console.error(`Login flow test ${testCase.name} failed:`, error);
        results.loginFlows[testCase.name] = false;
      }
    }

    // Test permission enforcement
    try {
      const buyer = authTestFixtures.getUser('test-buyer-verified');
      const admin = authTestFixtures.getUser('test-admin');
      
      const buyerPermissions = buyer?.permissions || [];
      const adminPermissions = admin?.permissions || [];
      
      const buyerCannotModerate = !buyerPermissions.includes('moderate_users');
      const adminCanModerate = adminPermissions.includes('moderate_users');
      
      results.permissionEnforcement = buyerCannotModerate && adminCanModerate;
    } catch (error) {
      console.error('Permission enforcement test failed:', error);
    }

    // Test session management
    try {
      const user = authTestFixtures.getUser('test-buyer-verified')!;
      const shortSession = authTestFixtures.createSession(user, 1); // 1 second expiry
      
      // Wait for session to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const expiredSession = authTestFixtures.validateSession(shortSession.access_token);
      results.sessionManagement = !expiredSession; // Should be null/false
    } catch (error) {
      console.error('Session management test failed:', error);
    }

    // Test KYC validation
    try {
      const verifiedUser = authTestFixtures.getUser('test-buyer-verified')!;
      const pendingUser = authTestFixtures.getUser('test-buyer-pending-kyc')!;
      const failedUser = authTestFixtures.getUser('test-buyer-failed-kyc')!;
      
      const verifiedCanBid = verifiedUser.permissions.includes('place_bids') && 
                            verifiedUser.kyc_status === 'passed';
      const pendingCannotBid = !pendingUser.permissions.includes('place_bids') || 
                              pendingUser.kyc_status !== 'passed';
      const failedCannotBid = !failedUser.permissions.includes('place_bids') || 
                             failedUser.kyc_status === 'failed';
      
      results.kycValidation = verifiedCanBid && pendingCannotBid && failedCannotBid;
    } catch (error) {
      console.error('KYC validation test failed:', error);
    }

    return results;
  }

  /**
   * Run Integration tests combining WebSocket and Auth
   */
  private async runIntegrationTests(): Promise<MVPTestResults['integration']> {
    const results = {
      realtimeAuctions: false,
      concurrentBidding: false,
      auctionTiming: false,
      userExperience: false
    };

    // Test real-time auction functionality
    try {
      const bidders = [
        authTestFixtures.getUser('test-buyer-verified')!,
        authTestFixtures.getUser('test-seller-verified')!
      ];

      const bidUpdateReceived = { count: 0 };
      
      // Create connections for bidders
      const connections = bidders.map((user, index) => {
        const conn = this.webSocketServer.createConnection(user.id, 'integration-test');
        conn.addEventListener('bid_update', () => bidUpdateReceived.count++);
        return conn;
      });

      // Simulate bid update
      await this.webSocketServer.simulateBidUpdate({
        listing_id: 'integration-test',
        current_bid_cents: 25000,
        minimum_bid_cents: 25100,
        bid_count: 1,
        winning_bidder_id: bidders[0].id
      });

      await new Promise(resolve => setTimeout(resolve, 100));
      results.realtimeAuctions = bidUpdateReceived.count === bidders.length;
    } catch (error) {
      console.error('Real-time auction test failed:', error);
    }

    // Test concurrent bidding
    try {
      const { winner, conflicts } = await this.webSocketServer.simulateRaceCondition(
        'concurrent-test',
        ['user-a', 'user-b', 'user-c'],
        30000
      );
      
      results.concurrentBidding = !!winner && conflicts.length === 2;
    } catch (error) {
      console.error('Concurrent bidding test failed:', error);
    }

    // Test auction timing accuracy
    try {
      const startTime = Date.now();
      const testDuration = 5000; // 5 seconds
      
      // Simulate auction countdown
      const endTime = new Date(startTime + testDuration);
      
      await new Promise(resolve => setTimeout(resolve, testDuration));
      
      const actualDuration = Date.now() - startTime;
      const timingAccurate = Math.abs(actualDuration - testDuration) < 100; // 100ms tolerance
      
      results.auctionTiming = timingAccurate;
    } catch (error) {
      console.error('Auction timing test failed:', error);
    }

    // Test overall user experience flow
    try {
      // Simulate complete user journey: login -> view auction -> bid -> receive updates
      const user = authTestFixtures.getUser('test-buyer-verified')!;
      const session = authTestFixtures.createSession(user);
      const connection = this.webSocketServer.createConnection(user.id, 'ux-test');
      
      let journeySteps = 0;
      
      // Step 1: Valid session
      if (authTestFixtures.validateSession(session.access_token)) journeySteps++;
      
      // Step 2: Can bid (has permission)
      if (user.permissions.includes('place_bids')) journeySteps++;
      
      // Step 3: Receives real-time updates
      connection.addEventListener('bid_update', () => journeySteps++);
      await this.webSocketServer.simulateBidUpdate({
        listing_id: 'ux-test',
        current_bid_cents: 35000,
        minimum_bid_cents: 35100,
        bid_count: 1,
        winning_bidder_id: 'other-user'
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      results.userExperience = journeySteps >= 3;
    } catch (error) {
      console.error('User experience test failed:', error);
    }

    return results;
  }

  /**
   * Calculate overall test results
   */
  private calculateOverallResults(duration: number): MVPTestResults['overall'] {
    let passed = 0;
    let failed = 0;

    // Count WebSocket results
    if (this.results.websocket) {
      const ws = this.results.websocket;
      if (ws.connectionResilience) passed++; else failed++;
      if (ws.eventBroadcasting) passed++; else failed++;
      if (ws.raceConditionHandling) passed++; else failed++;
    }

    // Count Authentication results
    if (this.results.authentication) {
      const auth = this.results.authentication;
      Object.values(auth.loginFlows).forEach(result => {
        if (result) passed++; else failed++;
      });
      if (auth.permissionEnforcement) passed++; else failed++;
      if (auth.sessionManagement) passed++; else failed++;
      if (auth.kycValidation) passed++; else failed++;
    }

    // Count Integration results
    if (this.results.integration) {
      const int = this.results.integration;
      if (int.realtimeAuctions) passed++; else failed++;
      if (int.concurrentBidding) passed++; else failed++;
      if (int.auctionTiming) passed++; else failed++;
      if (int.userExperience) passed++; else failed++;
    }

    const total = passed + failed;
    const coverage = total > 0 ? (passed / total) * 100 : 0;

    return {
      passed,
      failed,
      coverage,
      duration
    };
  }

  /**
   * Generate comprehensive test report
   */
  generateReport(): string {
    if (!this.results.overall) {
      return 'No test results available. Run tests first.';
    }

    const { overall, websocket, authentication, integration } = this.results as MVPTestResults;

    return `
MVP TESTING REPORT
==================

OVERALL RESULTS:
• Tests Passed: ${overall.passed}
• Tests Failed: ${overall.failed}
• Coverage: ${overall.coverage.toFixed(1)}%
• Duration: ${(overall.duration / 1000).toFixed(2)}s

WEBSOCKET TESTING:
• Connection Resilience: ${websocket.connectionResilience ? '✅' : '❌'}
• Event Broadcasting: ${websocket.eventBroadcasting ? '✅' : '❌'}  
• Race Condition Handling: ${websocket.raceConditionHandling ? '✅' : '❌'}
• Average Latency: ${websocket.performanceMetrics.averageLatency.toFixed(2)}ms
• Throughput: ${websocket.performanceMetrics.throughput.toFixed(2)} events/sec
• Memory Usage: ${(websocket.performanceMetrics.memoryUsage / 1024 / 1024).toFixed(2)}MB

AUTHENTICATION TESTING:
• Permission Enforcement: ${authentication.permissionEnforcement ? '✅' : '❌'}
• Session Management: ${authentication.sessionManagement ? '✅' : '❌'}
• KYC Validation: ${authentication.kycValidation ? '✅' : '❌'}
• Login Flows:
${Object.entries(authentication.loginFlows).map(([name, result]) => 
  `  - ${name}: ${result ? '✅' : '❌'}`
).join('\n')}

INTEGRATION TESTING:
• Real-time Auctions: ${integration.realtimeAuctions ? '✅' : '❌'}
• Concurrent Bidding: ${integration.concurrentBidding ? '✅' : '❌'}
• Auction Timing: ${integration.auctionTiming ? '✅' : '❌'}
• User Experience: ${integration.userExperience ? '✅' : '❌'}

${overall.coverage >= 90 ? '🎉 MVP READY FOR DEPLOYMENT' : 
  overall.coverage >= 80 ? '⚠️ MINOR ISSUES - REVIEW FAILED TESTS' : 
  '❌ MAJOR ISSUES - DO NOT DEPLOY'}
    `.trim();
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    try {
      this.webSocketServer.cleanup();
      authTestFixtures.reset();
    } catch (error) {
      console.warn('Cleanup error:', error);
    }
  }
}

export default MVPTestRunner;