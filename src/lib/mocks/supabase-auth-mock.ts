/**
 * Mock Supabase authentication service for E2E testing
 * Provides simulated authentication, user sessions, and basic database operations
 */

import type { RequestEvent } from '@sveltejs/kit';

export interface MockUser {
  id: string;
  email: string;
  role: 'authenticated' | 'admin' | 'seller' | 'buyer';
  created_at: string;
  metadata: Record<string, any>;
}

export interface MockSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: MockUser;
}

export interface MockListing {
  id: string;
  title: string;
  start_cents: number;
  reserve_cents: number;
  end_at: string;
  bid_count: number;
  current_bid_cents?: number;
  seller_id: string;
  status: 'active' | 'ended' | 'sold';
}

export interface MockBid {
  id: string;
  listing_id: string;
  bidder_id: string;
  amount_cents: number;
  created_at: string;
}

export interface MockWebhookEvent {
  event_id: string;
  type: string;
  order_id: string | null;
  event_type: string;
  created_at: string;
  processed_at: string | null;
  error_message: string | null;
  retry_count: number;
}

export interface MockOrder {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount_cents: number;
  state: 'pending' | 'pending_payment' | 'paid' | 'ready_for_handover' | 'shipped' | 'delivered' | 'released' | 'refunded' | 'cancelled' | 'payment_failed' | 'disputed';
  stripe_payment_intent_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  paid_at?: string | null;
  refunded_at?: string | null;
}

export interface MockPayment {
  order_id: string;
  amount_cents: number;
  currency: string;
  payment_method: string;
  stripe_payment_intent_id: string | null;
  stripe_charge_id?: string | null;
  stripe_refund_id?: string | null;
  status: 'pending' | 'completed' | 'failed';
  processed_at: string;
  error_message?: string | null;
  capturable_amount_cents?: number | null;
}

export interface MockNotification {
  id: string;
  user_id: string;
  type: 'order_paid' | 'order_shipped' | 'order_delivered' | 'payment_failed' | 'dispute_created' | 'new_message';
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  metadata?: Record<string, any>;
}

export class SupabaseAuthMock {
  private users: Map<string, MockUser> = new Map();
  private sessions: Map<string, MockSession> = new Map();
  private listings: Map<string, MockListing> = new Map();
  private bids: Map<string, MockBid> = new Map();
  private webhookEvents: Map<string, MockWebhookEvent> = new Map();
  private orders: Map<string, MockOrder> = new Map();
  private payments: Map<string, MockPayment> = new Map();
  private notifications: Map<string, MockNotification> = new Map();
  private tokenCounter = 0;

  constructor() {
    this.seedTestData();
  }

  /**
   * Seed with test data for E2E tests
   */
  private seedTestData(): void {
    // Create test users
    const testUser1 = this.createUser('test@example.com', 'buyer');
    const testUser2 = this.createUser('seller@example.com', 'seller');
    const adminUser = this.createUser('admin@example.com', 'admin');
    
    // Set specific test user ID for E2E tests
    const e2eTestUser: MockUser = {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'test@example.com',
      role: 'buyer',
      created_at: new Date().toISOString(),
      metadata: { role: 'buyer' }
    };
    this.users.set(e2eTestUser.id, e2eTestUser);
    
    // Create a test session for the E2E test user 
    const testSession = this.createSession(e2eTestUser);
    // Override with a predictable token for E2E tests
    testSession.access_token = 'test-token-for-e2e';
    this.sessions.set('test-token-for-e2e', testSession);
    
    // Create test notifications for the E2E test user
    this.createNotification({
      id: '33333333-3333-3333-3333-333333333333',
      user_id: e2eTestUser.id,
      type: 'order_paid',
      title: 'Payment Received',
      message: 'Payment completed',
      read: false,
      created_at: new Date().toISOString()
    });
    
    this.createNotification({
      id: '44444444-4444-4444-4444-444444444444',
      user_id: e2eTestUser.id,
      type: 'order_shipped',
      title: 'Item Shipped',
      message: 'Your item shipped',
      read: false,
      created_at: new Date().toISOString()
    });

    // Create test listings
    this.createListing({
      id: 'e2e-listing-1',
      title: 'Test Auction Item 1',
      start_cents: 1000,
      reserve_cents: 2000,
      end_at: new Date(Date.now() + 86400000).toISOString(), // 24 hours from now
      seller_id: testUser2.id,
      bid_count: 1,
      current_bid_cents: 1200,
      status: 'active'
    });

    this.createListing({
      id: 'e2e-listing-2',
      title: 'Test Auction Item 2',
      start_cents: 500,
      reserve_cents: 1000,
      end_at: new Date(Date.now() + 43200000).toISOString(), // 12 hours from now
      seller_id: testUser2.id,
      bid_count: 0,
      status: 'active'
    });

    // Create test bid
    this.createBid({
      id: 'e2e-bid-1',
      listing_id: 'e2e-listing-1',
      bidder_id: testUser1.id,
      amount_cents: 1200,
      created_at: new Date().toISOString()
    });
  }

  /**
   * Create a test user
   */
  createUser(email: string, role: MockUser['role'] = 'authenticated'): MockUser {
    const user: MockUser = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      email,
      role,
      created_at: new Date().toISOString(),
      metadata: { role }
    };

    this.users.set(user.id, user);
    return user;
  }

  /**
   * Create a session for a user
   */
  createSession(user: MockUser): MockSession {
    const session: MockSession = {
      access_token: `mock_token_${++this.tokenCounter}_${Date.now()}`,
      refresh_token: `mock_refresh_${++this.tokenCounter}_${Date.now()}`,
      expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour
      user
    };

    this.sessions.set(session.access_token, session);
    return session;
  }

  /**
   * Authenticate user by email (simplified for testing)
   */
  authenticateByEmail(email: string): MockSession | null {
    const user = Array.from(this.users.values()).find(u => u.email === email);
    if (!user) return null;

    return this.createSession(user);
  }

  /**
   * Get session by token
   */
  getSession(token: string): MockSession | null {
    const session = this.sessions.get(token);
    if (!session) return null;

    // Check if session is expired
    if (session.expires_at < Math.floor(Date.now() / 1000)) {
      this.sessions.delete(token);
      return null;
    }

    return session;
  }

  /**
   * Create a listing
   */
  createListing(listing: MockListing): MockListing {
    this.listings.set(listing.id, listing);
    return listing;
  }

  /**
   * Get all listings
   */
  getListings(): MockListing[] {
    return Array.from(this.listings.values());
  }

  /**
   * Get listing by ID
   */
  getListing(id: string): MockListing | null {
    return this.listings.get(id) || null;
  }

  /**
   * Create a bid
   */
  createBid(bid: MockBid): MockBid {
    this.bids.set(bid.id, bid);

    // Update listing bid count and current bid
    const listing = this.listings.get(bid.listing_id);
    if (listing) {
      listing.bid_count++;
      listing.current_bid_cents = Math.max(listing.current_bid_cents || 0, bid.amount_cents);
      this.listings.set(listing.id, listing);
    }

    return bid;
  }

  /**
   * Get bids for a listing
   */
  getBidsForListing(listingId: string): MockBid[] {
    return Array.from(this.bids.values()).filter(bid => bid.listing_id === listingId);
  }

  /**
   * Create or update a webhook event
   */
  upsertWebhookEvent(event: Partial<MockWebhookEvent> & { event_id: string }, isInsert = false): MockWebhookEvent {
    const existing = this.webhookEvents.get(event.event_id);
    
    // If this is a strict insert and record already exists, throw unique constraint error
    if (isInsert && existing) {
      const error = new Error('duplicate key value violates unique constraint');
      (error as any).code = '23505';
      throw error;
    }
    
    const webhookEvent: MockWebhookEvent = {
      type: existing?.type || event.type || 'payment_intent.succeeded',
      order_id: existing?.order_id || event.order_id || null,
      event_type: existing?.event_type || event.event_type || event.type || 'payment_intent.succeeded',
      created_at: existing?.created_at || event.created_at || new Date().toISOString(),
      processed_at: event.processed_at !== undefined ? event.processed_at : existing?.processed_at || null,
      error_message: event.error_message !== undefined ? event.error_message : existing?.error_message || null,
      retry_count: existing?.retry_count || event.retry_count || 0,
      ...event
    };
    
    this.webhookEvents.set(event.event_id, webhookEvent);
    return webhookEvent;
  }

  /**
   * Get webhook event by ID
   */
  getWebhookEvent(eventId: string): MockWebhookEvent | null {
    return this.webhookEvents.get(eventId) || null;
  }

  /**
   * Get webhook events by order ID and type
   */
  getWebhookEventsByOrderAndType(orderId: string, eventType: string, excludeEventId?: string): MockWebhookEvent[] {
    return Array.from(this.webhookEvents.values()).filter(
      event => event.order_id === orderId && 
               event.event_type === eventType && 
               (!excludeEventId || event.event_id !== excludeEventId)
    );
  }

  /**
   * Create or update an order
   */
  upsertOrder(order: Partial<MockOrder> & { id: string }): MockOrder {
    const existing = this.orders.get(order.id);
    const mockOrder: MockOrder = {
      listing_id: existing?.listing_id || order.listing_id || 'test-listing',
      buyer_id: existing?.buyer_id || order.buyer_id || 'test-buyer',
      seller_id: existing?.seller_id || order.seller_id || 'test-seller',
      amount_cents: existing?.amount_cents || order.amount_cents || 1000,
      state: order.state || existing?.state || 'pending_payment',
      stripe_payment_intent_id: order.stripe_payment_intent_id !== undefined ? order.stripe_payment_intent_id : existing?.stripe_payment_intent_id || null,
      version: order.version !== undefined ? order.version : (existing?.version || 0),
      created_at: existing?.created_at || order.created_at || new Date().toISOString(),
      updated_at: order.updated_at || new Date().toISOString(),
      paid_at: order.paid_at !== undefined ? order.paid_at : existing?.paid_at || null,
      refunded_at: order.refunded_at !== undefined ? order.refunded_at : existing?.refunded_at || null,
      ...order
    };
    
    this.orders.set(order.id, mockOrder);
    return mockOrder;
  }

  /**
   * Auto-create test orders for webhook testing
   */
  ensureTestOrder(orderId: string): void {
    if (!this.orders.has(orderId)) {
      this.upsertOrder({
        id: orderId,
        listing_id: 'test-listing-' + orderId,
        buyer_id: 'test-buyer-' + orderId, 
        seller_id: 'test-seller-' + orderId,
        amount_cents: 1000,
        state: 'pending_payment',
        version: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  }

  /**
   * Get order by ID
   */
  getOrder(orderId: string): MockOrder | null {
    return this.orders.get(orderId) || null;
  }

  /**
   * Create or update a payment
   */
  upsertPayment(payment: MockPayment): MockPayment {
    const key = `${payment.order_id}_${payment.stripe_payment_intent_id || payment.stripe_charge_id || payment.stripe_refund_id}`;
    this.payments.set(key, payment);
    return payment;
  }

  /**
   * Get payments by payment intent ID
   */
  getPaymentsByIntentId(paymentIntentId: string): MockPayment[] {
    return Array.from(this.payments.values()).filter(
      payment => payment.stripe_payment_intent_id === paymentIntentId
    );
  }

  /**
   * Create a notification
   */
  createNotification(notification: MockNotification): MockNotification {
    this.notifications.set(notification.id, notification);
    return notification;
  }

  /**
   * Get notifications for a user
   */
  getUserNotifications(userId: string): MockNotification[] {
    return Array.from(this.notifications.values())
      .filter(notification => notification.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  /**
   * Get unread notification count for a user
   */
  getUnreadNotificationCount(userId: string): number {
    return Array.from(this.notifications.values())
      .filter(notification => notification.user_id === userId && !notification.read)
      .length;
  }

  /**
   * Mark notification as read
   */
  markNotificationAsRead(notificationId: string): MockNotification | null {
    const notification = this.notifications.get(notificationId);
    if (notification) {
      notification.read = true;
      this.notifications.set(notificationId, notification);
      return notification;
    }
    return null;
  }

  /**
   * Mark all notifications as read for a user
   */
  markAllNotificationsAsRead(userId: string): number {
    let count = 0;
    for (const [id, notification] of this.notifications.entries()) {
      if (notification.user_id === userId && !notification.read) {
        notification.read = true;
        this.notifications.set(id, notification);
        count++;
      }
    }
    return count;
  }

  /**
   * Mock PostgreSQL functions
   */
  mockRpcCall(functionName: string, params: any): Promise<{ data: any; error: any }> {
    switch (functionName) {
      case 'pg_try_advisory_lock':
        // Simulate successful lock acquisition
        return Promise.resolve({ data: true, error: null });
      
      case 'pg_advisory_unlock':
        // Simulate successful lock release
        return Promise.resolve({ data: true, error: null });
      
      default:
        return Promise.resolve({ data: null, error: { message: `Unknown RPC function: ${functionName}` } });
    }
  }

  /**
   * Health check
   */
  healthCheck(): { status: 'ok'; service: 'supabase-mock'; timestamp: number; stats: any } {
    return {
      status: 'ok',
      service: 'supabase-mock',
      timestamp: Date.now(),
      stats: {
        users: this.users.size,
        sessions: this.sessions.size,
        listings: this.listings.size,
        bids: this.bids.size
      }
    };
  }

  /**
   * Reset all data
   */
  reset(): void {
    this.users.clear();
    this.sessions.clear();
    this.listings.clear();
    this.bids.clear();
    this.webhookEvents.clear();
    this.orders.clear();
    this.payments.clear();
    this.notifications.clear();
    this.tokenCounter = 0;
    this.seedTestData();
  }
}

// Global instance for E2E tests
export const supabaseAuthMock = new SupabaseAuthMock();

/**
 * Handle mock Supabase requests in E2E environment
 */
export async function handleMockSupabaseAuth(event: RequestEvent): Promise<Response> {
  const { request } = event;
  const url = new URL(request.url);

  try {
    // Health check
    if (url.pathname.endsWith('/health')) {
      return new Response(JSON.stringify(supabaseAuthMock.healthCheck()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Authentication
    if (url.pathname.includes('/auth/token') && request.method === 'POST') {
      const body = await request.json();
      const session = supabaseAuthMock.authenticateByEmail(body.email || 'test@example.com');

      if (!session) {
        return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: 3600,
        user: session.user
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get user by token
    if (url.pathname.includes('/auth/user') && request.method === 'GET') {
      const authHeader = request.headers.get('Authorization');
      const token = authHeader?.replace('Bearer ', '');

      if (!token) {
        return new Response(JSON.stringify({ error: 'No token provided' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const session = supabaseAuthMock.getSession(token);
      if (!session) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ user: session.user }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Listings
    if (url.pathname.includes('/rest/v1/listings') && request.method === 'GET') {
      const listings = supabaseAuthMock.getListings();
      return new Response(JSON.stringify(listings), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // RPC calls (PostgreSQL functions)
    if (url.pathname.includes('/rpc/') && request.method === 'POST') {
      const functionName = url.pathname.split('/rpc/')[1];
      const body = await request.json();
      const result = await supabaseAuthMock.mockRpcCall(functionName, body);
      
      return new Response(JSON.stringify(result.data), {
        status: result.error ? 400 : 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Webhook Events table operations
    if (url.pathname === '/rest/v1/webhook_events') {
      if (request.method === 'GET') {
        // Parse Supabase query parameters
        const select = url.searchParams.get('select');
        let eventIdEq = null;
        let orderIdEq = null;
        let eventTypeEq = null;
        let excludeEventId = null;
        
        // Parse filter conditions
        for (const [key, value] of url.searchParams.entries()) {
          if (key === 'event_id' && value.startsWith('eq.')) {
            eventIdEq = value.replace('eq.', '');
          } else if (key === 'order_id' && value.startsWith('eq.')) {
            orderIdEq = value.replace('eq.', '');
          } else if (key === 'event_type' && value.startsWith('eq.')) {
            eventTypeEq = value.replace('eq.', '');
          } else if (key === 'event_id' && value.startsWith('neq.')) {
            excludeEventId = value.replace('neq.', '');
          }
        }
        
        if (eventIdEq) {
          // Single event lookup for .maybeSingle() calls
          const event = supabaseAuthMock.getWebhookEvent(eventIdEq);
          return new Response(JSON.stringify(event), {
            status: 200,
            headers: { 
              'Content-Type': 'application/json',
              'Content-Range': event ? '0-0/*' : '*/*'
            }
          });
        } else if (orderIdEq && eventTypeEq) {
          // Order-specific event lookup
          const events = supabaseAuthMock.getWebhookEventsByOrderAndType(orderIdEq, eventTypeEq, excludeEventId || undefined);
          return new Response(JSON.stringify(events), {
            status: 200,
            headers: { 
              'Content-Type': 'application/json',
              'Content-Range': `0-${Math.max(0, events.length - 1)}/*`
            }
          });
        }
        
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Content-Range': '*/0'
          }
        });
      }
      
      if (request.method === 'POST') {
        const body = await request.json();
        try {
          const event = supabaseAuthMock.upsertWebhookEvent(body, true); // true = isInsert
          return new Response(JSON.stringify(event), {
            status: 201,
            headers: { 
              'Content-Type': 'application/json',
              'Location': `/webhook_events?event_id=eq.${event.event_id}`
            }
          });
        } catch (error: any) {
          if (error.message?.includes('unique constraint') || error.code === '23505') {
            return new Response(JSON.stringify({ 
              message: 'duplicate key value violates unique constraint', 
              code: '23505',
              details: 'Key (event_id) already exists'
            }), {
              status: 409,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          throw error;
        }
      }
      
      if (request.method === 'PATCH') {
        const body = await request.json();
        // Parse the event_id filter from query params
        let eventIdEq = null;
        for (const [key, value] of url.searchParams.entries()) {
          if (key === 'event_id' && value.startsWith('eq.')) {
            eventIdEq = value.replace('eq.', '');
            break;
          }
        }
        
        if (eventIdEq) {
          const event = supabaseAuthMock.upsertWebhookEvent({ event_id: eventIdEq, ...body });
          return new Response('', {
            status: 204,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        return new Response(JSON.stringify({ message: 'No matching records found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Orders table operations
    if (url.pathname === '/rest/v1/orders') {
      if (request.method === 'GET') {
        // Parse filter conditions
        let orderIdEq = null;
        for (const [key, value] of url.searchParams.entries()) {
          if (key === 'id' && value.startsWith('eq.')) {
            orderIdEq = value.replace('eq.', '');
            break;
          }
        }
        
        if (orderIdEq) {
          // Auto-create test orders for webhook testing
          supabaseAuthMock.ensureTestOrder(orderIdEq);
          const order = supabaseAuthMock.getOrder(orderIdEq);
          return new Response(JSON.stringify(order), {
            status: 200,
            headers: { 
              'Content-Type': 'application/json',
              'Content-Range': order ? '0-0/*' : '*/*'
            }
          });
        }
        
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Content-Range': '*/0'
          }
        });
      }
      
      if (request.method === 'PATCH') {
        const body = await request.json();
        
        // Parse filter conditions and requirements for atomic updates
        let orderIdEq = null;
        let stateIn = null;
        let versionEq = null;
        
        for (const [key, value] of url.searchParams.entries()) {
          if (key === 'id' && value.startsWith('eq.')) {
            orderIdEq = value.replace('eq.', '');
          } else if (key === 'state' && value.startsWith('in.(')) {
            stateIn = value.replace('in.(', '').replace(')', '').split(',').map(s => s.trim().replace(/"/g, ''));
          } else if (key === 'version' && value.startsWith('eq.')) {
            versionEq = parseInt(value.replace('eq.', ''));
          }
        }
        
        if (orderIdEq) {
          const existingOrder = supabaseAuthMock.getOrder(orderIdEq);
          
          // Check constraints for atomic updates
          if (stateIn && existingOrder && !stateIn.includes(existingOrder.state)) {
            // State constraint violation - return empty result (no rows updated)
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: { 
                'Content-Type': 'application/json',
                'Content-Range': '*/0'
              }
            });
          }
          
          if (versionEq !== null && existingOrder && existingOrder.version !== versionEq) {
            // Version mismatch - optimistic locking failure
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: { 
                'Content-Type': 'application/json',
                'Content-Range': '*/0'
              }
            });
          }
          
          const order = supabaseAuthMock.upsertOrder({ id: orderIdEq, ...body });
          return new Response(JSON.stringify([order]), {
            status: 200,
            headers: { 
              'Content-Type': 'application/json',
              'Content-Range': '0-0/*'
            }
          });
        }
        
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Content-Range': '*/0'
          }
        });
      }
    }

    // Payments table operations  
    if (url.pathname === '/rest/v1/payments') {
      if (request.method === 'POST') {
        const body = await request.json();
        
        // Handle upsert with conflict resolution
        const onConflict = request.headers.get('prefer')?.includes('resolution=merge-duplicates');
        if (onConflict) {
          // This is an upsert operation
          const payment = supabaseAuthMock.upsertPayment(body);
          return new Response(JSON.stringify(payment), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          // Regular insert
          const payment = supabaseAuthMock.upsertPayment(body);
          return new Response(JSON.stringify(payment), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      if (request.method === 'PATCH') {
        const body = await request.json();
        const payment = supabaseAuthMock.upsertPayment(body);
        return new Response(JSON.stringify(payment), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      if (request.method === 'GET') {
        // Parse filter conditions
        let paymentIntentIdEq = null;
        for (const [key, value] of url.searchParams.entries()) {
          if (key === 'stripe_payment_intent_id' && value.startsWith('eq.')) {
            paymentIntentIdEq = value.replace('eq.', '');
            break;
          }
        }
        
        if (paymentIntentIdEq) {
          const payments = supabaseAuthMock.getPaymentsByIntentId(paymentIntentIdEq);
          return new Response(JSON.stringify(payments), {
            status: 200,
            headers: { 
              'Content-Type': 'application/json',
              'Content-Range': `0-${Math.max(0, payments.length - 1)}/*`
            }
          });
        }
        
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Content-Range': '*/0'
          }
        });
      }
    }

    // Bids
    if (url.pathname.includes('/rest/v1/bids') && request.method === 'POST') {
      const body = await request.json();
      const authHeader = request.headers.get('Authorization');
      const token = authHeader?.replace('Bearer ', '');

      if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const session = supabaseAuthMock.getSession(token);
      if (!session) {
        return new Response(JSON.stringify({ error: 'Invalid session' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const bid = supabaseAuthMock.createBid({
        id: `bid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        listing_id: body.listing_id,
        bidder_id: session.user.id,
        amount_cents: body.amount_cents,
        created_at: new Date().toISOString()
      });

      return new Response(JSON.stringify(bid), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Notifications table operations
    if (url.pathname === '/rest/v1/notifications') {
      const authHeader = request.headers.get('Authorization');
      const token = authHeader?.replace('Bearer ', '');

      if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const session = supabaseAuthMock.getSession(token);
      if (!session) {
        return new Response(JSON.stringify({ error: 'Invalid session' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (request.method === 'HEAD') {
        // HEAD request for count
        const count = supabaseAuthMock.getUnreadNotificationCount(session.user.id);
        return new Response('', {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Content-Range': `0-0/${count}`
          }
        });
      }

      if (request.method === 'GET') {
        const prefer = request.headers.get('Prefer') || request.headers.get('prefer') || '';
        
        if (prefer.includes('count=exact')) {
          // GET with count=exact header
          const count = supabaseAuthMock.getUnreadNotificationCount(session.user.id);
          return new Response('', {
            status: 200,
            headers: { 
              'Content-Type': 'application/json',
              'Content-Range': `0-0/${count}`
            }
          });
        } else {
          // Regular GET for notifications list
          const notifications = supabaseAuthMock.getUserNotifications(session.user.id);
          return new Response(JSON.stringify(notifications), {
            status: 200,
            headers: { 
              'Content-Type': 'application/json',
              'Content-Range': `0-${Math.max(0, notifications.length - 1)}/*`
            }
          });
        }
      }

      if (request.method === 'PATCH') {
        const body = await request.json();
        
        // Check if this is marking all notifications as read (filter by user_id and read=false)
        let userIdEq = null;
        let readEq = null;
        
        for (const [key, value] of url.searchParams.entries()) {
          if (key === 'user_id' && value.startsWith('eq.')) {
            userIdEq = value.replace('eq.', '');
          } else if (key === 'read' && value.startsWith('eq.')) {
            readEq = value.replace('eq.', '') === 'false' ? false : true;
          }
        }
        
        if (userIdEq === session.user.id && readEq === false) {
          // Mark all unread notifications as read
          const count = supabaseAuthMock.markAllNotificationsAsRead(session.user.id);
          return new Response('', {
            status: 204,
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          // Single notification update (by id)
          let notificationIdEq = null;
          for (const [key, value] of url.searchParams.entries()) {
            if (key === 'id' && value.startsWith('eq.')) {
              notificationIdEq = value.replace('eq.', '');
              break;
            }
          }
          
          if (notificationIdEq) {
            const notification = supabaseAuthMock.markNotificationAsRead(notificationIdEq);
            if (notification) {
              return new Response('', {
                status: 204,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
          
          return new Response(JSON.stringify({ message: 'No matching notification found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }

    return new Response(JSON.stringify({ error: 'Mock endpoint not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Mock Supabase error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal mock server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}