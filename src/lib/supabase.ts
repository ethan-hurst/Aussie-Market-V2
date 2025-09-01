import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
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
					protection_eligible: boolean;
					state: 'pending' | 'paid' | 'ready_for_handover' | 'shipped' | 'delivered' | 'released' | 'refunded' | 'cancelled';
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					listing_id: string;
					buyer_id: string;
					seller_id: string;
					amount_cents: number;
					protection_eligible?: boolean;
					state?: 'pending' | 'paid' | 'ready_for_handover' | 'shipped' | 'delivered' | 'released' | 'refunded' | 'cancelled';
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					listing_id?: string;
					buyer_id?: string;
					seller_id?: string;
					amount_cents?: number;
					protection_eligible?: boolean;
					state?: 'pending' | 'paid' | 'ready_for_handover' | 'shipped' | 'delivered' | 'released' | 'refunded' | 'cancelled';
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


