import { SupabaseClient, Session } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase';

declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient<Database>;
			getSession(): Promise<Session | null>;
		}
		interface PageData {
			session: Session | null;
			userProfile: any | null;
		}
		// interface Error {}
		// interface Platform {}
	}
}

export {};
