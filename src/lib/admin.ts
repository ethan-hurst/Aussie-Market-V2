import { supabase } from './supabase';

/**
 * Check if user has admin privileges
 */
export async function isAdmin(userId: string): Promise<{
	allowed: boolean;
	reason?: string;
	userProfile?: any;
}> {
	try {
		const { data: userProfile, error } = await supabase
			.from('users')
			.select('id, email, role, legal_name')
			.eq('id', userId)
			.single();

		if (error) {
			return { allowed: false, reason: 'User profile not found' };
		}

		if (userProfile.role !== 'admin') {
			return { 
				allowed: false, 
				reason: 'Admin privileges required',
				userProfile 
			};
		}

		return { allowed: true, userProfile };
	} catch (error) {
		console.error('Error checking admin permissions:', error);
		return { allowed: false, reason: 'Permission check failed' };
	}
}

/**
 * Get admin audit log entry
 */
export function createAdminAuditLog(
	adminId: string,
	action: string,
	details: any,
	resourceId?: string
) {
	return {
		admin_id: adminId,
		action,
		details,
		resource_id: resourceId,
		timestamp: new Date().toISOString(),
		ip_address: null, // Could be added from request context
		user_agent: null  // Could be added from request context
	};
}
