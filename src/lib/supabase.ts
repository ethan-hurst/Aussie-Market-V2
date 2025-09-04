import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';

const supabaseUrl = env.PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY || 'anon';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
	auth: {
		autoRefreshToken: true,
		persistSession: true,
		detectSessionInUrl: true
	},
	realtime: {
		params: {
			eventsPerSecond: 10
		}
	}
});

// Test-only: allow Playwright to override the realtime channel factory to simulate events
if (typeof window !== 'undefined') {
  const anyWin: any = window as any;
  if (anyWin.__TEST_OVERRIDE_SUPABASE_CHANNEL && typeof anyWin.__TEST_OVERRIDE_SUPABASE_CHANNEL === 'function') {
    (supabase as any).channel = (...args: any[]) => anyWin.__TEST_OVERRIDE_SUPABASE_CHANNEL(...args);
  }
}

// Database types
export type Database = {
	public: {
		Tables: {
			users: {
				Row: {
					id: string;
					email: string;
					phone: string | null;
					legal_name: string | null;
					dob: string | null;
					address: any | null;
					role: 'buyer' | 'seller' | 'moderator' | 'admin';
					kyc: 'none' | 'pending' | 'passed' | 'failed';
					stripe_customer_id: string | null;
					stripe_connect_account_id: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					email: string;
					phone?: string | null;
					legal_name?: string | null;
					dob?: string | null;
					address?: any | null;
					role?: 'buyer' | 'seller' | 'moderator' | 'admin';
					kyc?: 'none' | 'pending' | 'passed' | 'failed';
					stripe_customer_id?: string | null;
					stripe_connect_account_id?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					email?: string;
					phone?: string | null;
					legal_name?: string | null;
					dob?: string | null;
					address?: any | null;
					role?: 'buyer' | 'seller' | 'moderator' | 'admin';
					kyc?: 'none' | 'pending' | 'passed' | 'failed';
					stripe_customer_id?: string | null;
					stripe_connect_account_id?: string | null;
					created_at?: string;
					updated_at?: string;
				};
			};
			listings: {
				Row: {
					id: string;
					seller_id: string;
					title: string;
					description: string;
					category_id: number;
					condition: 'new' | 'like_new' | 'good' | 'fair' | 'parts';
					location: any;
					pickup: boolean;
					shipping: boolean;
					reserve_cents: number | null;
					buy_now_cents: number | null;
					start_cents: number;
					start_at: string;
					end_at: string;
					status: string;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					seller_id: string;
					title: string;
					description: string;
					category_id: number;
					condition: 'new' | 'like_new' | 'good' | 'fair' | 'parts';
					location: any;
					pickup?: boolean;
					shipping?: boolean;
					reserve_cents?: number | null;
					buy_now_cents?: number | null;
					start_cents: number;
					start_at?: string;
					end_at: string;
					status?: string;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					seller_id?: string;
					title?: string;
					description?: string;
					category_id?: number;
					condition?: 'new' | 'like_new' | 'good' | 'fair' | 'parts';
					location?: any;
					pickup?: boolean;
					shipping?: boolean;
					reserve_cents?: number | null;
					buy_now_cents?: number | null;
					start_cents?: number;
					start_at?: string;
					end_at?: string;
					status?: string;
					created_at?: string;
					updated_at?: string;
				};
			};
			auctions: {
				Row: {
					id: string;
					listing_id: string;
					reserve_met: boolean;
					extension_count: number;
					increment_scheme: string;
					high_bid_id: string | null;
					current_price_cents: number;
					status: string;
				};
				Insert: {
					id?: string;
					listing_id: string;
					reserve_met?: boolean;
					extension_count?: number;
					increment_scheme?: string;
					high_bid_id?: string | null;
					current_price_cents?: number;
					status?: string;
				};
				Update: {
					id?: string;
					listing_id?: string;
					reserve_met?: boolean;
					extension_count?: number;
					increment_scheme?: string;
					high_bid_id?: string | null;
					current_price_cents?: number;
					status?: string;
				};
			};
			bids: {
				Row: {
					id: string;
					auction_id: string;
					bidder_id: string;
					amount_cents: number;
					max_proxy_cents: number | null;
					accepted: boolean;
					placed_at: string;
				};
				Insert: {
					id?: string;
					auction_id: string;
					bidder_id: string;
					amount_cents: number;
					max_proxy_cents?: number | null;
					accepted?: boolean;
					placed_at?: string;
				};
				Update: {
					id?: string;
					auction_id?: string;
					bidder_id?: string;
					amount_cents?: number;
					max_proxy_cents?: number | null;
					accepted?: boolean;
					placed_at?: string;
				};
			};
			orders: {
				Row: {
					id: string;
					listing_id: string;
					buyer_id: string;
					seller_id: string;
					amount_cents: number;
					platform_fee_cents?: number | null;
					seller_amount_cents?: number | null;
					protection_eligible: boolean;
					state: 'pending' | 'pending_payment' | 'paid' | 'ready_for_handover' | 'shipped' | 'delivered' | 'released' | 'refunded' | 'cancelled';
					auction_id?: string | null;
					winning_bid_id?: string | null;
					payment_intent_id?: string | null;
					stripe_payment_intent_id?: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					listing_id: string;
					buyer_id: string;
					seller_id: string;
					amount_cents: number;
					platform_fee_cents?: number | null;
					seller_amount_cents?: number | null;
					protection_eligible?: boolean;
					state?: 'pending' | 'pending_payment' | 'paid' | 'ready_for_handover' | 'shipped' | 'delivered' | 'released' | 'refunded' | 'cancelled';
					auction_id?: string | null;
					winning_bid_id?: string | null;
					payment_intent_id?: string | null;
					stripe_payment_intent_id?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					listing_id?: string;
					buyer_id?: string;
					seller_id?: string;
					amount_cents?: number;
					platform_fee_cents?: number | null;
					seller_amount_cents?: number | null;
					protection_eligible?: boolean;
					state?: 'pending' | 'pending_payment' | 'paid' | 'ready_for_handover' | 'shipped' | 'delivered' | 'released' | 'refunded' | 'cancelled';
					auction_id?: string | null;
					winning_bid_id?: string | null;
					payment_intent_id?: string | null;
					stripe_payment_intent_id?: string | null;
					created_at?: string;
					updated_at?: string;
				};
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			[_ in never]: never;
		};
		Enums: {
			[_ in never]: never;
		};
	};
};


