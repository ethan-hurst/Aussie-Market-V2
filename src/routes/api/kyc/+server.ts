import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabase';
import { completeKYCVerification } from '$lib/auth';
import { getSessionUserFromLocals, validateUserAccess } from '$lib/session';
import { ApiErrorHandler } from '$lib/api-error-handler';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, request }) => {
	try {
		// Get authenticated user with proper error handling
		const user = await getSessionUserFromLocals(locals);

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
		// Handle authentication errors gracefully
		if (error instanceof Response) {
			return error;
		}
		return ApiErrorHandler.handleError(error as Error, { request, locals, url }, {
			operation: 'get_kyc_status',
			userId: undefined // User not available in catch scope
		});
	}
};

export const POST: RequestHandler = async ({ request, locals, url }) => {
	try {
		// Get authenticated user with proper error handling
		const user = await getSessionUserFromLocals(locals);

		const { sessionId } = await request.json();

		if (!sessionId) {
			return json({ error: 'Missing sessionId' }, { status: 400 });
		}

		// Complete KYC verification
		const result = await completeKYCVerification(user.id, sessionId);

		return json(result);
	} catch (error) {
		// Handle authentication errors gracefully
		if (error instanceof Response) {
			return error;
		}
		return ApiErrorHandler.handleError(error as Error, { request, locals, url }, {
			operation: 'complete_kyc',
			userId: undefined // User not available in catch scope
		});
	}
};
