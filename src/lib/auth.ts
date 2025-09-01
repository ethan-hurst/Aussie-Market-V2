import { supabase } from './supabase';
import { createIdentityVerificationSession, type IdentityVerificationData } from './stripe';

export interface KYCVerificationData {
	legal_name: string;
	dob: string;
	address: {
		street: string;
		suburb: string;
		postcode: string;
		state: string;
	};
}

export async function startKYCVerification(userId: string, data: KYCVerificationData) {
	try {
		// Parse legal name into first and last name
		const nameParts = data.legal_name.trim().split(' ');
		const firstName = nameParts[0] || '';
		const lastName = nameParts.slice(1).join(' ') || '';

		// Parse date of birth
		const dobDate = new Date(data.dob);
		const dobFormatted = {
			day: dobDate.getDate(),
			month: dobDate.getMonth() + 1,
			year: dobDate.getFullYear()
		};

		// Format address for Stripe
		const stripeAddress = {
			line1: data.address.street,
			city: data.address.suburb,
			state: data.address.state,
			postal_code: data.address.postcode,
			country: 'AU'
		};

		// Create Stripe Identity verification session
		const verificationData: IdentityVerificationData = {
			first_name: firstName,
			last_name: lastName,
			dob: dobFormatted,
			address: stripeAddress
		};

		const verificationSession = await createIdentityVerificationSession(userId, verificationData);

		// Update user profile with KYC data and session info
		const { error: profileError } = await supabase
			.from('users')
			.update({
				legal_name: data.legal_name,
				dob: data.dob,
				address: data.address,
				kyc: 'pending',
				stripe_identity_session_id: verificationSession.id
			})
			.eq('id', userId);

		if (profileError) {
			console.error('Profile update error:', profileError);
			throw new Error('Failed to update profile for KYC');
		}

		return {
			success: true,
			verificationId: verificationSession.id,
			clientSecret: verificationSession.client_secret,
			verificationUrl: verificationSession.verification_session_url
		};
	} catch (error) {
		console.error('KYC verification error:', error);
		throw error;
	}
}

export async function completeKYCVerification(userId: string, verificationId: string) {
	try {
		// Import the function here to avoid circular dependency
		const { getVerificationSessionStatus } = await import('./stripe');
		
		// Get verification status from Stripe
		const verificationStatus = await getVerificationSessionStatus(verificationId);
		
		let kycStatus: 'passed' | 'failed' | 'pending' = 'pending';
		let kycDetails: any = null;

		// Map Stripe verification status to our KYC status
		switch (verificationStatus.status) {
			case 'verified':
				kycStatus = 'passed';
				kycDetails = {
					verified_at: new Date().toISOString(),
					verified_outputs: verificationStatus.verified_outputs
				};
				break;
			case 'requires_input':
			case 'processing':
				kycStatus = 'pending';
				break;
			case 'canceled':
			case 'verification_failed':
				kycStatus = 'failed';
				kycDetails = {
					failed_at: new Date().toISOString(),
					failure_reason: verificationStatus.last_error?.reason || 'Verification failed'
				};
				break;
			default:
				kycStatus = 'pending';
		}

		// Update user profile with verification results
		const { error } = await supabase
			.from('users')
			.update({
				kyc: kycStatus,
				kyc_details: kycDetails,
				kyc_completed_at: kycStatus === 'passed' ? new Date().toISOString() : null
			})
			.eq('id', userId);

		if (error) {
			console.error('KYC status update error:', error);
			throw new Error('Failed to update KYC status');
		}

		return { 
			success: kycStatus === 'passed',
			status: kycStatus,
			details: kycDetails
		};
	} catch (error) {
		console.error('KYC completion error:', error);
		throw error;
	}
}

export async function upgradeToSeller(userId: string) {
	try {
		const { error } = await supabase
			.from('users')
			.update({
				role: 'seller'
			})
			.eq('id', userId);

		if (error) {
			throw new Error('Failed to upgrade to seller');
		}

		return { success: true };
	} catch (error) {
		console.error('Seller upgrade error:', error);
		throw error;
	}
}

export async function checkUserPermissions(userId: string, requiredRole: string = 'buyer') {
	try {
		const { data: user, error } = await supabase
			.from('users')
			.select('role, kyc')
			.eq('id', userId)
			.single();

		if (error) {
			throw new Error('Failed to get user permissions');
		}

		// Check role requirements
		if (requiredRole === 'seller' && user.role !== 'seller') {
			return { allowed: false, reason: 'Seller account required' };
		}

		// Check KYC requirements for sellers
		if (requiredRole === 'seller' && user.kyc !== 'passed') {
			return { allowed: false, reason: 'KYC verification required' };
		}

		return { allowed: true };
	} catch (error) {
		console.error('Permission check error:', error);
		return { allowed: false, reason: 'Permission check failed' };
	}
}

export async function refreshUserSession() {
	try {
		const { data, error } = await supabase.auth.refreshSession();
		if (error) {
			throw error;
		}
		return data.session;
	} catch (error) {
		console.error('Session refresh error:', error);
		throw error;
	}
}
