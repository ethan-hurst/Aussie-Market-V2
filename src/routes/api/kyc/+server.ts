import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabase';
import { completeKYCVerification } from '$lib/auth';
import { getSessionUserOrThrow, validateUserAccess } from '$lib/session';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, request }) => {
	try {
		// Get authenticated user with proper error handling
		const user = await getSessionUserOrThrow({ request, locals } as any);

		const sessionId = url.searchParams.get('session_id');
		const userId = url.searchParams.get('user_id');

		if (!sessionId || !userId) {
			return json({ error: 'Missing session_id or user_id' }, { status: 400 });
		}

		// Verify the user_id matches the authenticated user
		if (user.id !== userId) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		// Complete KYC verification using the real Stripe Identity integration
		const result = await completeKYCVerification(userId, sessionId);

		return json({
			success: result.success,
			status: result.status,
			details: result.details
		});
	} catch (error) {
		console.error('KYC status check error:', error);
		return json({ error: 'Failed to check KYC status' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { data: { session } } = await locals.getSession();
		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { sessionId } = await request.json();

		if (!sessionId) {
			return json({ error: 'Missing sessionId' }, { status: 400 });
		}

		// Complete KYC verification
		const result = await completeKYCVerification(session.user.id, sessionId);

		return json(result);
	} catch (error) {
		console.error('KYC completion error:', error);
		return json({ error: 'Failed to complete KYC verification' }, { status: 500 });
	}
};
