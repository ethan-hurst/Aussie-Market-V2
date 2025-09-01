import Stripe from 'stripe';
import { env } from './env';

// Initialize Stripe with validated configuration
export const stripe = new Stripe(env.STRIPE_SECRET_KEY || 'sk_test_your_stripe_secret_key_here', {
	apiVersion: '2024-06-20',
	typescript: true
});

// Stripe Identity verification types
export interface IdentityVerificationData {
	first_name: string;
	last_name: string;
	dob: {
		day: number;
		month: number;
		year: number;
	};
	address: {
		line1: string;
		line2?: string;
		city: string;
		state: string;
		postal_code: string;
		country: string;
	};
	ssn_last_4?: string;
	verification_document?: {
		back?: string;
		front: string;
	};
}

export interface IdentityVerificationSession {
	id: string;
	client_secret: string;
	status: string;
	verification_session_url: string;
}

/**
 * Create a Stripe Identity verification session for KYC
 */
export async function createIdentityVerificationSession(
	userId: string,
	verificationData: IdentityVerificationData
): Promise<IdentityVerificationSession> {
	try {
		// Create a verification session
		const verificationSession = await stripe.identity.verificationSessions.create({
			type: 'document',
			return_url: `${env.PUBLIC_SITE_URL}/account/kyc/complete?user_id=${userId}`,
			metadata: {
				user_id: userId
			},
			// For Australia, we'll use document verification
			document: {
				allowed_types: ['driving_license', 'passport', 'id_card'],
				require_id_number: false,
				require_live_capture: false,
				require_matching_selfie: false
			},
			// Collect personal information
			provided_details: {
				first_name: verificationData.first_name,
				last_name: verificationData.last_name,
				dob: verificationData.dob,
				address: verificationData.address
			}
		});

		return {
			id: verificationSession.id,
			client_secret: verificationSession.client_secret!,
			status: verificationSession.status,
			verification_session_url: verificationSession.url!
		};
	} catch (error) {
		console.error('Error creating identity verification session:', error);
		throw new Error('Failed to create verification session');
	}
}

/**
 * Retrieve verification session status
 */
export async function getVerificationSessionStatus(sessionId: string) {
	try {
		const session = await stripe.identity.verificationSessions.retrieve(sessionId);
		return {
			id: session.id,
			status: session.status,
			verified_outputs: session.verified_outputs,
			last_error: session.last_error
		};
	} catch (error) {
		console.error('Error retrieving verification session:', error);
		throw new Error('Failed to retrieve verification status');
	}
}

/**
 * Create a Stripe Customer for payment processing
 */
export async function createStripeCustomer(userId: string, email: string, name?: string) {
	try {
		const customer = await stripe.customers.create({
			email,
			name,
			metadata: {
				user_id: userId
			}
		});

		return customer;
	} catch (error) {
		console.error('Error creating Stripe customer:', error);
		throw new Error('Failed to create customer');
	}
}

/**
 * Create a Stripe Connect account for seller payouts
 */
export async function createConnectAccount(userId: string, email: string, businessData: any) {
	try {
		const account = await stripe.accounts.create({
			type: 'express',
			country: 'AU',
			email,
			capabilities: {
				card_payments: { requested: true },
				transfers: { requested: true }
			},
			business_type: 'individual',
			individual: {
				first_name: businessData.first_name,
				last_name: businessData.last_name,
				email,
				dob: businessData.dob,
				address: businessData.address,
				phone: businessData.phone
			},
			metadata: {
				user_id: userId
			}
		});

		return account;
	} catch (error) {
		console.error('Error creating Connect account:', error);
		throw new Error('Failed to create Connect account');
	}
}

/**
 * Create an account link for Connect onboarding
 */
export async function createAccountLink(accountId: string, userId: string) {
	try {
		const accountLink = await stripe.accountLinks.create({
			account: accountId,
			refresh_url: `${env.PUBLIC_SITE_URL}/account/connect/refresh?user_id=${userId}`,
			return_url: `${env.PUBLIC_SITE_URL}/account/connect/complete?user_id=${userId}`,
			type: 'account_onboarding'
		});

		return accountLink;
	} catch (error) {
		console.error('Error creating account link:', error);
		throw new Error('Failed to create account link');
	}
}

/**
 * Get Connect account status
 */
export async function getConnectAccountStatus(accountId: string) {
	try {
		const account = await stripe.accounts.retrieve(accountId);
		return {
			id: account.id,
			charges_enabled: account.charges_enabled,
			payouts_enabled: account.payouts_enabled,
			requirements: account.requirements,
			details_submitted: account.details_submitted
		};
	} catch (error) {
		console.error('Error retrieving Connect account:', error);
		throw new Error('Failed to retrieve account status');
	}
}
