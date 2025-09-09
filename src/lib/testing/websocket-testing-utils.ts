/**
 * WebSocket Testing Infrastructure for MVP Real-time Auction Features
 * Provides WebSocket connection mocking, event simulation, and race condition testing
 */

export interface WebSocketMockOptions {
  reconnectAttempts?: number;
  connectionDelay?: number;
  messageDelay?: number;
  failureRate?: number;
}

export interface BidUpdateEvent {
  listing_id: string;
  current_bid_cents: number;
  minimum_bid_cents: number;
  bid_count: number;
  winning_bidder_id: string;
  outbid_user_id?: string | null;
  timestamp: string;
  event_type: 'bid_update';
}

export interface AuctionStatusEvent {
  listing_id: string;
  status: 'active' | 'ended' | 'extended';
  end_at?: string;
  extension_minutes?: number;
  timestamp: string;
  event_type: 'auction_status';
}

export interface ConnectionEvent {
  type: 'connected' | 'disconnected' | 'reconnected' | 'error';
  timestamp: string;
  retry_count?: number;
  error_message?: string;
}

export type WebSocketEvent = BidUpdateEvent | AuctionStatusEvent | ConnectionEvent;

export class WebSocketMockServer {
  private connections: Map<string, WebSocketMockConnection> = new Map();
  private eventQueue: WebSocketEvent[] = [];
  private options: WebSocketMockOptions;

  constructor(options: WebSocketMockOptions = {}) {
    this.options = {
      reconnectAttempts: 3,
      connectionDelay: 100,
      messageDelay: 50,
      failureRate: 0,
      ...options
    };
  }

  /**
   * Create a new mock WebSocket connection for testing
   */
  createConnection(userId: string, listingId?: string): WebSocketMockConnection {
    const connectionId = `${userId}_${listingId || 'global'}_${Date.now()}`;
    const connection = new WebSocketMockConnection(connectionId, userId, listingId, this.options);
    
    this.connections.set(connectionId, connection);
    return connection;
  }

  /**
   * Simulate a bid update event across all relevant connections
   */
  async simulateBidUpdate(event: Omit<BidUpdateEvent, 'timestamp' | 'event_type'>): Promise<void> {
    const bidEvent: BidUpdateEvent = {
      ...event,
      timestamp: new Date().toISOString(),
      event_type: 'bid_update'
    };

    // Send to all connections listening to this listing
    const relevantConnections = Array.from(this.connections.values())
      .filter(conn => !conn.listingId || conn.listingId === event.listing_id);

    await Promise.all(
      relevantConnections.map(conn => conn.receiveEvent(bidEvent))
    );

    this.eventQueue.push(bidEvent);
  }

  /**
   * Simulate auction status change
   */
  async simulateAuctionStatusChange(event: Omit<AuctionStatusEvent, 'timestamp' | 'event_type'>): Promise<void> {
    const statusEvent: AuctionStatusEvent = {
      ...event,
      timestamp: new Date().toISOString(),
      event_type: 'auction_status'
    };

    const relevantConnections = Array.from(this.connections.values())
      .filter(conn => !conn.listingId || conn.listingId === event.listing_id);

    await Promise.all(
      relevantConnections.map(conn => conn.receiveEvent(statusEvent))
    );

    this.eventQueue.push(statusEvent);
  }

  /**
   * Simulate connection failures for testing resilience
   */
  async simulateConnectionFailure(userId: string, duration: number = 3000): Promise<void> {
    const userConnections = Array.from(this.connections.values())
      .filter(conn => conn.userId === userId);

    // Disconnect all user connections
    await Promise.all(
      userConnections.map(conn => conn.simulateDisconnect())
    );

    // Reconnect after duration
    setTimeout(async () => {
      await Promise.all(
        userConnections.map(conn => conn.simulateReconnect())
      );
    }, duration);
  }

  /**
   * Create race condition scenario for testing concurrent bids
   */
  async simulateRaceCondition(
    listingId: string,
    bidders: string[],
    targetBidAmount: number
  ): Promise<{ winner: string; conflicts: string[] }> {
    let winner: string | null = null;
    const conflicts: string[] = [];

    // Simulate all bidders attempting to bid simultaneously
    const bidPromises = bidders.map(async (bidderId, index) => {
      // Add random delay to simulate network latency
      const delay = Math.random() * 200;
      await new Promise(resolve => setTimeout(resolve, delay));

      // First bidder wins, others get conflict
      if (winner === null) {
        winner = bidderId;
        
        await this.simulateBidUpdate({
          listing_id: listingId,
          current_bid_cents: targetBidAmount,
          minimum_bid_cents: targetBidAmount + 100,
          bid_count: 1,
          winning_bidder_id: bidderId
        });

        return { success: true, bidderId };
      } else {
        conflicts.push(bidderId);
        
        // Send conflict notification to this bidder's connections
        const bidderConnections = Array.from(this.connections.values())
          .filter(conn => conn.userId === bidderId);

        await Promise.all(
          bidderConnections.map(conn => conn.receiveEvent({
            type: 'error',
            timestamp: new Date().toISOString(),
            error_message: 'Bid amount no longer valid - auction state changed'
          }))
        );

        return { success: false, bidderId };
      }
    });

    await Promise.all(bidPromises);

    return {
      winner: winner!,
      conflicts
    };
  }

  /**
   * Get connection statistics for testing
   */
  getConnectionStats(): {
    active_connections: number;
    total_events_sent: number;
    connections_by_listing: Record<string, number>;
  } {
    const connectionsByListing: Record<string, number> = {};
    
    for (const conn of this.connections.values()) {
      const key = conn.listingId || 'global';
      connectionsByListing[key] = (connectionsByListing[key] || 0) + 1;
    }

    return {
      active_connections: this.connections.size,
      total_events_sent: this.eventQueue.length,
      connections_by_listing: connectionsByListing
    };
  }

  /**
   * Clean up all connections
   */
  cleanup(): void {
    for (const connection of this.connections.values()) {
      connection.close();
    }
    this.connections.clear();
    this.eventQueue = [];
  }
}

export class WebSocketMockConnection {
  public readonly connectionId: string;
  public readonly userId: string;
  public readonly listingId?: string;
  
  private connected: boolean = true;
  private reconnectAttempts: number = 0;
  private eventHandlers: Map<string, Function[]> = new Map();
  private messageQueue: WebSocketEvent[] = [];
  private options: WebSocketMockOptions;

  constructor(
    connectionId: string,
    userId: string,
    listingId: string | undefined,
    options: WebSocketMockOptions
  ) {
    this.connectionId = connectionId;
    this.userId = userId;
    this.listingId = listingId;
    this.options = options;
  }

  /**
   * Mock WebSocket send method
   */
  async send(data: any): Promise<void> {
    if (!this.connected) {
      throw new Error('WebSocket is not connected');
    }

    // Simulate message delay
    if (this.options.messageDelay) {
      await new Promise(resolve => setTimeout(resolve, this.options.messageDelay));
    }

    // Simulate failure rate
    if (this.options.failureRate && Math.random() < this.options.failureRate!) {
      throw new Error('WebSocket send failed');
    }

    console.log(`[WebSocket ${this.connectionId}] Sent:`, data);
  }

  /**
   * Mock event listener registration
   */
  addEventListener(eventType: string, handler: Function): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(handler);
  }

  /**
   * Remove event listener
   */
  removeEventListener(eventType: string, handler: Function): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Simulate receiving an event
   */
  async receiveEvent(event: WebSocketEvent): Promise<void> {
    if (!this.connected) {
      this.messageQueue.push(event);
      return;
    }

    // Simulate message delay
    if (this.options.messageDelay) {
      await new Promise(resolve => setTimeout(resolve, this.options.messageDelay));
    }

    // Trigger appropriate event handlers
    const eventType = 'event_type' in event ? event.event_type : event.type;
    const handlers = this.eventHandlers.get(eventType) || [];
    const messageHandlers = this.eventHandlers.get('message') || [];

    [...handlers, ...messageHandlers].forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error(`[WebSocket ${this.connectionId}] Event handler error:`, error);
      }
    });

    console.log(`[WebSocket ${this.connectionId}] Received event:`, event);
  }

  /**
   * Simulate connection disconnect
   */
  async simulateDisconnect(): Promise<void> {
    this.connected = false;
    
    const disconnectEvent: ConnectionEvent = {
      type: 'disconnected',
      timestamp: new Date().toISOString()
    };

    const handlers = this.eventHandlers.get('close') || [];
    handlers.forEach(handler => handler(disconnectEvent));

    console.log(`[WebSocket ${this.connectionId}] Disconnected`);
  }

  /**
   * Simulate connection reconnect
   */
  async simulateReconnect(): Promise<void> {
    this.reconnectAttempts++;
    
    // Simulate connection delay
    if (this.options.connectionDelay) {
      await new Promise(resolve => setTimeout(resolve, this.options.connectionDelay));
    }

    this.connected = true;

    const reconnectEvent: ConnectionEvent = {
      type: 'reconnected',
      timestamp: new Date().toISOString(),
      retry_count: this.reconnectAttempts
    };

    const handlers = this.eventHandlers.get('open') || [];
    handlers.forEach(handler => handler(reconnectEvent));

    // Process queued messages
    while (this.messageQueue.length > 0) {
      const event = this.messageQueue.shift()!;
      await this.receiveEvent(event);
    }

    console.log(`[WebSocket ${this.connectionId}] Reconnected (attempt ${this.reconnectAttempts})`);
  }

  /**
   * Get connection state for testing
   */
  getState(): {
    connected: boolean;
    reconnect_attempts: number;
    queued_messages: number;
    event_handlers: Record<string, number>;
  } {
    const handlerCounts: Record<string, number> = {};
    for (const [eventType, handlers] of this.eventHandlers.entries()) {
      handlerCounts[eventType] = handlers.length;
    }

    return {
      connected: this.connected,
      reconnect_attempts: this.reconnectAttempts,
      queued_messages: this.messageQueue.length,
      event_handlers: handlerCounts
    };
  }

  /**
   * Close the connection
   */
  close(): void {
    this.connected = false;
    this.eventHandlers.clear();
    this.messageQueue = [];
    console.log(`[WebSocket ${this.connectionId}] Closed`);
  }
}

/**
 * Test utilities for WebSocket functionality
 */
export class WebSocketTestUtils {
  /**
   * Create browser script for WebSocket mocking in Playwright tests
   */
  static getBrowserMockScript(): string {
    return `
      // WebSocket Mock for E2E Tests
      window.__WebSocketMock = class {
        constructor(url) {
          this.url = url;
          this.readyState = 1; // OPEN
          this.listeners = new Map();
          this.messageQueue = [];
          
          // Auto-connect after short delay
          setTimeout(() => {
            if (this.onopen) this.onopen({ type: 'open' });
            this.trigger('open', { type: 'open' });
          }, 10);
        }

        send(data) {
          console.log('[WebSocket Mock] Send:', data);
          
          // Simulate bid processing
          if (data.includes('place_bid')) {
            const bidData = JSON.parse(data);
            setTimeout(() => {
              this.simulateMessage({
                type: 'bid_update',
                listing_id: bidData.listing_id,
                current_bid_cents: bidData.amount_cents,
                winning_bidder_id: 'current-user'
              });
            }, 100);
          }
        }

        addEventListener(event, handler) {
          if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
          }
          this.listeners.get(event).push(handler);
        }

        removeEventListener(event, handler) {
          const handlers = this.listeners.get(event);
          if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) handlers.splice(index, 1);
          }
        }

        close() {
          this.readyState = 3; // CLOSED
          if (this.onclose) this.onclose({ type: 'close' });
          this.trigger('close', { type: 'close' });
        }

        simulateMessage(data) {
          const event = { data: JSON.stringify(data), type: 'message' };
          if (this.onmessage) this.onmessage(event);
          this.trigger('message', event);
        }

        simulateError(error) {
          const event = { error, type: 'error' };
          if (this.onerror) this.onerror(event);
          this.trigger('error', event);
        }

        trigger(eventName, event) {
          const handlers = this.listeners.get(eventName) || [];
          handlers.forEach(handler => handler(event));
        }
      };

      // Override native WebSocket
      const OriginalWebSocket = window.WebSocket;
      window.WebSocket = window.__WebSocketMock;
      window.WebSocket.CONNECTING = 0;
      window.WebSocket.OPEN = 1;
      window.WebSocket.CLOSING = 2;
      window.WebSocket.CLOSED = 3;
    `;
  }

  /**
   * Generate test data for auction scenarios
   */
  static generateAuctionTestData(listingId: string, options: {
    startPrice: number;
    currentBid?: number;
    bidCount?: number;
    timeRemaining?: number;
    status?: string;
  }) {
    const {
      startPrice,
      currentBid = startPrice,
      bidCount = 0,
      timeRemaining = 3600000, // 1 hour
      status = 'active'
    } = options;

    return {
      id: listingId,
      title: `Test Auction ${listingId}`,
      start_cents: startPrice,
      current_bid_cents: currentBid,
      minimum_bid_cents: currentBid + 100,
      reserve_cents: Math.floor(startPrice * 1.5),
      bid_count: bidCount,
      end_at: new Date(Date.now() + timeRemaining).toISOString(),
      status,
      seller_id: `seller-${listingId}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Create performance test scenarios
   */
  static createPerformanceTestScenario(
    connectionCount: number,
    eventsPerSecond: number,
    duration: number
  ): {
    totalEvents: number;
    eventInterval: number;
    estimatedMemoryUsage: number;
  } {
    const totalEvents = eventsPerSecond * (duration / 1000) * connectionCount;
    const eventInterval = 1000 / eventsPerSecond;
    const estimatedMemoryUsage = totalEvents * 200; // ~200 bytes per event

    return {
      totalEvents,
      eventInterval,
      estimatedMemoryUsage
    };
  }
}

export default WebSocketMockServer;