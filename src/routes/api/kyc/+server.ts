import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createIdentityVerificationSession, getVerificationSessionStatus } from '$lib/stripe';
import { supabase } from '$lib/supabase';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { userId, verificationData } = await request.json();

		// Verify user is authenticated
		const session = await locals.getSession();
		if (!session || session.user.id !== userId) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Check if user already has a verification session
		const { data: existingSession } = await supabase
			.from('kyc_sessions')
			.select('*')
			.eq('user_id', userId)
			.eq('status', 'pending')
			.single();

		if (existingSession) {
			return json({ 
				error: 'Verification session already exists',
				sessionId: existingSession.stripe_session_id 
			}, { status: 400 });
		}

		// Create Stripe Identity verification session
		const stripeSession = await createIdentityVerificationSession(userId, verificationData);

		// Store session in database
		const { error: dbError } = await supabase
			.from('kyc_sessions')
			.insert({
				user_id: userId,
				stripe_session_id: stripeSession.id,
				status: 'pending',
				verification_data: verificationData
			});

		if (dbError) {
			console.error('Database error:', dbError);
			return json({ error: 'Failed to store verification session' }, { status: 500 });
		}

		// Update user KYC status to pending
		await supabase
			.from('users')
			.update({ kyc: 'pending' })
			.eq('id', userId);

		return json({
			sessionId: stripeSession.id,
			verificationUrl: stripeSession.verification_session_url,
			clientSecret: stripeSession.client_secret
		});

	} catch (error) {
		console.error('KYC session creation error:', error);
		return json({ error: 'Failed to create verification session' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		const sessionId = url.searchParams.get('session_id');
		const userId = url.searchParams.get('user_id');

		if (!sessionId || !userId) {
			return json({ error: 'Missing session_id or user_id' }, { status: 400 });
		}

		// Verify user is authenticated
		const session = await locals.getSession();
		if (!session || session.user.id !== userId) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Get verification session status from Stripe
		const stripeStatus = await getVerificationSessionStatus(sessionId);

		// Update database with latest status
		await supabase
			.from('kyc_sessions')
			.update({ 
				status: stripeStatus.status,
				verified_outputs: stripeStatus.verified_outputs,
				last_error: stripeStatus.last_error
			})
			.eq('stripe_session_id', sessionId);

		// Update user KYC status based on verification result
		let userKycStatus = 'pending';
		if (stripeStatus.status === 'verified') {
			userKycStatus = 'passed';
		} else if (stripeStatus.status === 'requires_input' || stripeStatus.last_error) {
			userKycStatus = 'failed';
		}

		await supabase
			.from('users')
			.update({ kyc: userKycStatus })
			.eq('id', userId);

		return json({
			status: stripeStatus.status,
			verifiedOutputs: stripeStatus.verified_outputs,
			lastError: stripeStatus.last_error,
			userKycStatus
		});

	} catch (error) {
		console.error('KYC status check error:', error);
		return json({ error: 'Failed to check verification status' }, { status: 500 });
	}
};
