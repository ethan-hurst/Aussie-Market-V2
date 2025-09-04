import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$lib/env';
import { supabase as anonClient } from '$lib/supabase';

// Server-side only import to optionally use service role for privileged reads
import { createClient } from '@supabase/supabase-js';
import { env as publicEnv } from '$env/dynamic/public';

function getClient() {
	const serviceKey = (typeof process !== 'undefined' && process.env && process.env.SUPABASE_SERVICE_ROLE_KEY) || undefined;
	if (serviceKey) {
		return createClient(publicEnv.PUBLIC_SUPABASE_URL as string, serviceKey);
	}
	return anonClient;
}

function isAuthorized(request: Request): boolean {
	const provided = request.headers.get('x-canary-token') || '';
	const expected = (typeof process !== 'undefined' && process.env && process.env.CANARY_TOKEN) || env?.PUBLIC_SITE_URL /* fallback to prevent undefined */;
	return Boolean(provided) && Boolean(process.env.CANARY_TOKEN) && provided === process.env.CANARY_TOKEN;
}

// GET /api/canary/webhook-events?event_id=evt_xxx
export const GET: RequestHandler = async ({ url, request }) => {
	if (!isAuthorized(request)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const client = getClient();

	const eventId = url.searchParams.get('event_id');
	const type = url.searchParams.get('type');
	const since = url.searchParams.get('since');

	if (eventId) {
		const { data, error } = await (client as any)
			.from('webhook_events')
			.select('event_id, type, created_at, processed_at')
			.eq('event_id', eventId)
			.single();
		if (error || !data) {
			return json({ found: false }, { status: 404 });
		}
		return json({ found: true, event: data });
	}

	if (type) {
		let query = (client as any)
			.from('webhook_events')
			.select('event_id, type, created_at, processed_at')
			.eq('type', type)
			.order('created_at', { ascending: false })
			.limit(1);
		if (since) {
			query = query.gte('created_at', since);
		}
		const { data, error } = await query;
		if (error || !data || data.length === 0) {
			return json({ found: false }, { status: 404 });
		}
		return json({ found: true, event: data[0] });
	}

	return json({ error: 'event_id or type required' }, { status: 400 });
};


