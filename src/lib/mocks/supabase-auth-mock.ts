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

export class SupabaseAuthMock {
  private users: Map<string, MockUser> = new Map();
  private sessions: Map<string, MockSession> = new Map();
  private listings: Map<string, MockListing> = new Map();
  private bids: Map<string, MockBid> = new Map();
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