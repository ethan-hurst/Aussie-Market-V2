/**
 * MVP Integration Helpers
 * Combines WebSocket and Auth testing utilities with existing test infrastructure
 */

import type { Page, BrowserContext, Response } from '@playwright/test';
import { WebSocketMockServer, WebSocketTestUtils, type BidUpdateEvent } from './websocket-testing-utils.js';
import { authTestFixtures, type TestUser, type AuthTestSession } from './auth-test-fixtures.js';
import { supabaseAuthMock } from '../mocks/supabase-auth-mock.js';

export interface MVPTestContext {
  page: Page;
  context: BrowserContext;
  webSocketServer: WebSocketMockServer;
  authenticatedUser?: TestUser;
  sessionToken?: string;
}

export interface AuctionTestScenario {
  listingId: string;
  participants: TestUser[];
  initialBid: number;
  reservePrice: number;
  duration: number;
  expectedWinner?: string;
}

export interface AuthTestScenario {
  name: string;
  user: TestUser;
  requiredPermissions: string[];
  restrictedActions: string[];
}

export class MVPIntegrationHelpers {
  /**
   * Setup complete E2E test environment with auth and WebSocket mocking
   */
  static async setupMVPTestContext(
    page: Page,
    context: BrowserContext,
    userId?: string
  ): Promise<MVPTestContext> {
    // Initialize WebSocket mock server
    const webSocketServer = new WebSocketMockServer({
      connectionDelay: 50,
      messageDelay: 25,
      failureRate: 0
    });

    // Setup WebSocket mocking in browser
    await page.addInitScript(WebSocketTestUtils.getBrowserMockScript());

    // Setup authentication if user specified
    let authenticatedUser: TestUser | undefined;
    let sessionToken: string | undefined;

    if (userId) {
      authenticatedUser = authTestFixtures.getUser(userId);
      if (authenticatedUser) {
        const session = authTestFixtures.createSession(authenticatedUser);
        sessionToken = session.access_token;

        // Set up browser auth state
        await page.addInitScript(authTestFixtures.getBrowserAuthScript());
        await page.addInitScript((token, user) => {
          window.__AuthTestHelpers.setUser(user.id, token);
        }, sessionToken, authenticatedUser);
      }
    }

    return {
      page,
      context,
      webSocketServer,
      authenticatedUser,
      sessionToken
    };
  }

  /**
   * Setup real-time auction test with multiple bidders
   */
  static async setupRealtimeAuctionTest(
    context: BrowserContext,
    scenario: AuctionTestScenario
  ): Promise<{
    pages: Page[];
    webSocketServer: WebSocketMockServer;
    users: TestUser[];
  }> {
    const webSocketServer = new WebSocketMockServer();
    const pages: Page[] = [];
    const users: TestUser[] = [];

    // Create page for each participant
    for (const user of scenario.participants) {
      const page = await context.newPage();
      
      // Setup WebSocket mocking
      await page.addInitScript(WebSocketTestUtils.getBrowserMockScript());
      
      // Setup auth
      const session = authTestFixtures.createSession(user);
      await page.addInitScript(authTestFixtures.getBrowserAuthScript());
      await page.addInitScript((token, userData) => {
        window.__AuthTestHelpers.setUser(userData.id, token);
      }, session.access_token, user);

      // Mock API routes for this user
      await this.setupAuctionAPIRoutes(page, scenario, user.id);

      pages.push(page);
      users.push(user);
    }

    return { pages, webSocketServer, users };
  }

  /**
   * Setup API route mocking for auction functionality
   */
  private static async setupAuctionAPIRoutes(
    page: Page,
    scenario: AuctionTestScenario,
    userId: string
  ): Promise<void> {
    const { listingId, initialBid, reservePrice, duration } = scenario;

    // Mock listing endpoint
    await page.route(`**/api/listings/${listingId}`, async (route) => {
      const listing = WebSocketTestUtils.generateAuctionTestData(listingId, {
        startPrice: initialBid,
        currentBid: initialBid,
        bidCount: 0,
        timeRemaining: duration,
        status: 'active'
      });

      listing.reserve_cents = reservePrice;
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ listing })
      });
    });

    // Mock bidding endpoint
    await page.route(`**/api/listings/${listingId}/bids`, async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        
        // Validate bid amount
        const currentListing = await supabaseAuthMock.getListing(listingId);
        const currentBid = currentListing?.current_bid_cents || initialBid;
        
        if (body.amount_cents <= currentBid) {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Bid amount must be higher than current bid',
              current_bid: currentBid
            })
          });
          return;
        }

        // Process successful bid
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            bid: {
              id: `bid-${Date.now()}`,
              listing_id: listingId,
              bidder_id: userId,
              amount_cents: body.amount_cents,
              created_at: new Date().toISOString()
            }
          })
        });
      }
    });

    // Set user context header
    await page.setExtraHTTPHeaders({ 'x-test-user-id': userId });
  }

  /**
   * Simulate concurrent bidding scenario
   */
  static async simulateConcurrentBidding(
    pages: Page[],
    webSocketServer: WebSocketMockServer,
    listingId: string,
    bidAmount: number
  ): Promise<{
    successfulBids: number;
    failedBids: number;
    winner?: string;
  }> {
    let successfulBids = 0;
    let failedBids = 0;
    let winner: string | undefined;

    // All participants attempt to bid simultaneously
    const bidPromises = pages.map(async (page, index) => {
      const userId = await page.evaluate(() => window.__AuthTestHelpers?.getCurrentUser()?.sub);
      
      try {
        await page.fill('[data-testid="bid-amount-input"]', (bidAmount / 100).toFixed(2));
        await page.click('[data-testid="place-bid-button"]');
        
        // Check for success or failure
        const successVisible = await page.locator('[data-testid="bid-success-message"]').isVisible({ timeout: 2000 }).catch(() => false);
        const errorVisible = await page.locator('[data-testid="bid-error-message"]').isVisible({ timeout: 2000 }).catch(() => false);
        
        if (successVisible) {
          successfulBids++;
          if (!winner) winner = userId;
          
          // Broadcast bid update to all pages
          await webSocketServer.simulateBidUpdate({
            listing_id: listingId,
            current_bid_cents: bidAmount,
            minimum_bid_cents: bidAmount + 100,
            bid_count: successfulBids,
            winning_bidder_id: userId
          });
          
          return { success: true, userId };
        } else if (errorVisible) {
          failedBids++;
          return { success: false, userId };
        }
        
        return { success: false, userId };
      } catch (error) {
        failedBids++;
        return { success: false, userId, error };
      }
    });

    await Promise.all(bidPromises);

    return {
      successfulBids,
      failedBids,
      winner
    };
  }

  /**
   * Test authentication flow with specific user scenario
   */
  static async testAuthenticationFlow(
    page: Page,
    user: TestUser,
    expectedOutcome: 'success' | 'failure' | 'requires_verification'
  ): Promise<{
    loginSuccessful: boolean;
    accessGranted: string[];
    accessDenied: string[];
    verificationRequired: boolean;
  }> {
    const accessGranted: string[] = [];
    const accessDenied: string[] = [];
    let loginSuccessful = false;
    let verificationRequired = false;

    // Attempt login
    try {
      const session = authTestFixtures.createSession(user);
      
      await page.addInitScript(authTestFixtures.getBrowserAuthScript());
      await page.addInitScript((token, userData) => {
        window.__AuthTestHelpers.setUser(userData.id, token);
      }, session.access_token, user);

      loginSuccessful = true;
    } catch (error) {
      console.log('Login failed:', error);
      return {
        loginSuccessful: false,
        accessGranted,
        accessDenied,
        verificationRequired: false
      };
    }

    // Test various permissions
    const testPermissions = [
      'view_listings',
      'place_bids',
      'create_listings',
      'access_admin_panel',
      'moderate_users'
    ];

    for (const permission of testPermissions) {
      const hasAccess = await page.evaluate((perm) => {
        return window.__AuthTestHelpers?.hasPermission(perm) || false;
      }, permission);

      if (hasAccess) {
        accessGranted.push(permission);
      } else {
        accessDenied.push(permission);
      }
    }

    // Check if verification is required
    verificationRequired = user.kyc_status === 'pending' || 
                          user.kyc_status === 'failed' || 
                          user.account_status === 'pending_verification';

    return {
      loginSuccessful,
      accessGranted,
      accessDenied,
      verificationRequired
    };
  }

  /**
   * Simulate WebSocket connection issues
   */
  static async simulateConnectionResilience(
    page: Page,
    webSocketServer: WebSocketMockServer,
    userId: string
  ): Promise<{
    initialConnection: boolean;
    disconnectionDetected: boolean;
    reconnectionSuccessful: boolean;
    messagesSyncedAfterReconnection: boolean;
  }> {
    let initialConnection = false;
    let disconnectionDetected = false;
    let reconnectionSuccessful = false;
    let messagesSyncedAfterReconnection = false;

    // Check initial connection
    initialConnection = await page.locator('[data-testid="connection-status-connected"]')
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (initialConnection) {
      // Simulate connection loss
      await webSocketServer.simulateConnectionFailure(userId, 3000);
      
      // Check for disconnection warning
      disconnectionDetected = await page.locator('[data-testid="connection-lost-warning"]')
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      // Wait for reconnection
      reconnectionSuccessful = await page.locator('[data-testid="connection-status-connected"]')
        .isVisible({ timeout: 6000 })
        .catch(() => false);

      if (reconnectionSuccessful) {
        // Test message sync after reconnection
        await webSocketServer.simulateBidUpdate({
          listing_id: 'test-listing',
          current_bid_cents: 15000,
          minimum_bid_cents: 15100,
          bid_count: 5,
          winning_bidder_id: 'other-user'
        });

        messagesSyncedAfterReconnection = await page.locator('[data-testid="current-bid"]')
          .textContent()
          .then(text => text?.includes('150.00'))
          .catch(() => false);
      }
    }

    return {
      initialConnection,
      disconnectionDetected,
      reconnectionSuccessful,
      messagesSyncedAfterReconnection
    };
  }

  /**
   * Validate auction countdown and timing accuracy
   */
  static async validateAuctionTiming(
    page: Page,
    expectedEndTime: Date,
    toleranceSeconds: number = 2
  ): Promise<{
    countdownVisible: boolean;
    timingAccurate: boolean;
    urgentModeTriggered: boolean;
    actualEndTime?: Date;
  }> {
    let countdownVisible = false;
    let timingAccurate = false;
    let urgentModeTriggered = false;
    let actualEndTime: Date | undefined;

    // Check if countdown is visible
    countdownVisible = await page.locator('[data-testid="countdown-timer"]')
      .isVisible()
      .catch(() => false);

    if (countdownVisible) {
      // Get current countdown time
      const minutesText = await page.locator('[data-testid="countdown-minutes"]').textContent();
      const secondsText = await page.locator('[data-testid="countdown-seconds"]').textContent();
      
      if (minutesText && secondsText) {
        const minutes = parseInt(minutesText);
        const seconds = parseInt(secondsText);
        const totalSeconds = minutes * 60 + seconds;
        
        // Calculate expected remaining time
        const now = new Date();
        const expectedRemainingSeconds = Math.floor((expectedEndTime.getTime() - now.getTime()) / 1000);
        
        // Check if timing is within tolerance
        timingAccurate = Math.abs(totalSeconds - expectedRemainingSeconds) <= toleranceSeconds;
        
        // Check if urgent mode is triggered (usually last 2 minutes)
        if (totalSeconds <= 120) {
          urgentModeTriggered = await page.locator('[data-testid="countdown-urgent"]')
            .isVisible()
            .catch(() => false);
        }
      }
    }

    return {
      countdownVisible,
      timingAccurate,
      urgentModeTriggered,
      actualEndTime
    };
  }

  /**
   * Performance testing utilities
   */
  static async measureWebSocketPerformance(
    webSocketServer: WebSocketMockServer,
    connectionCount: number,
    eventsPerSecond: number,
    durationSeconds: number
  ): Promise<{
    totalEvents: number;
    averageLatency: number;
    memoryUsage: number;
    droppedEvents: number;
  }> {
    const startTime = Date.now();
    const eventLatencies: number[] = [];
    let totalEvents = 0;
    let droppedEvents = 0;

    // Create connections
    const connections = Array.from({ length: connectionCount }, (_, i) => 
      webSocketServer.createConnection(`perf-user-${i}`)
    );

    // Send events at specified rate
    const eventInterval = 1000 / eventsPerSecond;
    const endTime = startTime + (durationSeconds * 1000);

    while (Date.now() < endTime) {
      const eventStart = Date.now();
      
      try {
        await webSocketServer.simulateBidUpdate({
          listing_id: 'perf-test-listing',
          current_bid_cents: Math.floor(Math.random() * 100000),
          minimum_bid_cents: Math.floor(Math.random() * 100000) + 100,
          bid_count: totalEvents,
          winning_bidder_id: `perf-user-${Math.floor(Math.random() * connectionCount)}`
        });

        eventLatencies.push(Date.now() - eventStart);
        totalEvents++;
      } catch {
        droppedEvents++;
      }

      await new Promise(resolve => setTimeout(resolve, eventInterval));
    }

    // Cleanup
    webSocketServer.cleanup();

    return {
      totalEvents,
      averageLatency: eventLatencies.length > 0 
        ? eventLatencies.reduce((a, b) => a + b, 0) / eventLatencies.length 
        : 0,
      memoryUsage: process.memoryUsage().heapUsed,
      droppedEvents
    };
  }

  /**
   * Cleanup test environment
   */
  static async cleanup(context: MVPTestContext): Promise<void> {
    try {
      if (context.webSocketServer) {
        context.webSocketServer.cleanup();
      }

      if (context.page && !context.page.isClosed()) {
        await context.page.evaluate(() => {
          if (window.__AuthTestHelpers) {
            window.__AuthTestHelpers.clearAuth();
          }
        });
      }

      // Reset auth fixtures for next test
      authTestFixtures.reset();
    } catch (error) {
      console.warn('Cleanup error:', error);
    }
  }
}

export default MVPIntegrationHelpers;