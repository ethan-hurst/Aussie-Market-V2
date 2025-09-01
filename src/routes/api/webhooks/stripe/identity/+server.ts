import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import { supabase } from '$lib/supabase';
import { env } from '$lib/env';
import type { RequestHandler } from './$types';

const stripe = new Stripe(env.STRIPE_SECRET_KEY || 'sk_test_your_stripe_secret_key_here', {
	apiVersion: '2024-06-20'
});

const endpointSecret = env.STRIPE_WEBHOOK_SECRET || 'whsec_your_webhook_secret_here';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.text();
	const sig = request.headers.get('stripe-signature');

	let event: Stripe.Event;

	try {
		event = stripe.webhooks.constructEvent(body, sig!, endpointSecret);
	} catch (err) {
		console.error('Webhook signature verification failed:', err);
		return json({ error: 'Invalid signature' }, { status: 400 });
	}

	try {
		switch (event.type) {
			case 'identity.verification_session.verified':
				await handleVerificationVerified(event.data.object as Stripe.Identity.VerificationSession);
				break;
			case 'identity.verification_session.requires_input':
				await handleVerificationRequiresInput(event.data.object as Stripe.Identity.VerificationSession);
				break;
			case 'identity.verification_session.processing':
				await handleVerificationProcessing(event.data.object as Stripe.Identity.VerificationSession);
				break;
			case 'identity.verification_session.canceled':
				await handleVerificationCanceled(event.data.object as Stripe.Identity.VerificationSession);
				break;
			case 'identity.verification_session.verification_failed':
				await handleVerificationFailed(event.data.object as Stripe.Identity.VerificationSession);
				break;
			default:
				console.log(`Unhandled event type: ${event.type}`);
		}

		return json({ received: true });
	} catch (error) {
		console.error('Error processing webhook:', error);
		return json({ error: 'Webhook processing failed' }, { status: 500 });
	}
};

async function handleVerificationVerified(session: Stripe.Identity.VerificationSession) {
	console.log('Identity verification verified:', session.id);
	
	await updateKYCStatus(session.id, 'verified', session.verified_outputs || null, null);
}

async function handleVerificationRequiresInput(session: Stripe.Identity.VerificationSession) {
	console.log('Identity verification requires input:', session.id);
	
	await updateKYCStatus(session.id, 'requires_input', null, session.last_error || null);
}

async function handleVerificationProcessing(session: Stripe.Identity.VerificationSession) {
	console.log('Identity verification processing:', session.id);
	
	await updateKYCStatus(session.id, 'processing', null, null);
}

async function handleVerificationCanceled(session: Stripe.Identity.VerificationSession) {
	console.log('Identity verification canceled:', session.id);
	
	await updateKYCStatus(session.id, 'canceled', null, session.last_error || null);
}

async function handleVerificationFailed(session: Stripe.Identity.VerificationSession) {
	console.log('Identity verification failed:', session.id);
	
	await updateKYCStatus(session.id, 'verification_failed', null, session.last_error || null);
}

async function updateKYCStatus(
	sessionId: string, 
	status: string, 
	verifiedOutputs: any, 
	lastError: any
) {
	try {
		// Call the database function to update KYC status
		const { data, error } = await supabase.rpc('handle_kyc_webhook_update', {
			p_stripe_session_id: sessionId,
			p_status: status,
			p_verified_outputs: verifiedOutputs,
			p_last_error: lastError
		});

		if (error) {
			console.error('Database update error:', error);
			throw error;
		}

		if (!data?.success) {
			console.error('KYC update failed:', data?.error);
			throw new Error(data?.error || 'KYC update failed');
		}

		console.log('KYC status updated successfully:', data);
	} catch (error) {
		console.error('Error updating KYC status:', error);
		throw error;
	}
}
