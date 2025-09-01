import { supabase } from './supabase';

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
		// Update user profile with KYC data
		const { error: profileError } = await supabase
			.from('users')
			.update({
				legal_name: data.legal_name,
				dob: data.dob,
				address: data.address,
				kyc: 'pending'
			})
			.eq('id', userId);

		if (profileError) {
			throw new Error('Failed to update profile for KYC');
		}

		// In a real implementation, this would integrate with Stripe Identity
		// For now, we'll simulate the KYC process
		return {
			success: true,
			verificationId: `kyc_${userId}_${Date.now()}`
		};
	} catch (error) {
		console.error('KYC verification error:', error);
		throw error;
	}
}

export async function completeKYCVerification(userId: string, verificationId: string) {
	try {
		// In a real implementation, this would verify with Stripe Identity
		// For now, we'll simulate a successful verification
		const { error } = await supabase
			.from('users')
			.update({
				kyc: 'passed'
			})
			.eq('id', userId);

		if (error) {
			throw new Error('Failed to update KYC status');
		}

		return { success: true };
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
