import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Typed user interface for session handling
 */
export interface SessionUser {
	id: string;
	email?: string;
	user_metadata?: Record<string, any>;
	app_metadata?: Record<string, any>;
	aud?: string;
	created_at?: string;
	updated_at?: string;
}

/**
 * Typed session interface
 */
export interface Session {
	user: SessionUser;
	access_token?: string;
	refresh_token?: string;
	expires_at?: number;
	expires_in?: number;
	token_type?: string;
}

/**
 * Session response from Supabase
 */
export interface SessionResponse {
	data: {
		session: Session | null;
	};
}

/**
 * Error class for session-related errors
 */
export class SessionError extends Error {
	constructor(message: string, public statusCode: number = 401) {
		super(message);
		this.name = 'SessionError';
	}
}

/**
 * Get session from request with proper typing and error handling
 * Supports both real sessions and test mode with x-test-user-id header
 * 
 * @param event - SvelteKit request event
 * @returns Promise<Session> - Typed session object
 * @throws SessionError - If session is invalid or missing
 */
export async function getSession(event: RequestEvent): Promise<Session> {
	try {
		// Check for test mode authentication header first
		const testUserId = event.request.headers.get('x-test-user-id');
		if (testUserId && testUserId.trim() !== '') {
			// Create a complete mock session for testing
			const mockSession: Session = {
				user: {
					id: testUserId,
					email: `${testUserId}@example.com`,
					user_metadata: { full_name: `Test User ${testUserId}` },
					app_metadata: {},
					aud: 'authenticated',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				},
				access_token: `mock-access-token-${testUserId}`,
				refresh_token: `mock-refresh-token-${testUserId}`,
				expires_at: Date.now() + 3600000, // 1 hour from now
				expires_in: 3600,
				token_type: 'bearer'
			};
			return mockSession;
		}

		const sessionResp = await event.locals.getSession();
		
		// Handle different response formats from getSession()
		const session = (sessionResp as any)?.data?.session 
			?? (sessionResp as any)?.session 
			?? null;
		
		if (!session || !session.user || !session.user.id) {
			throw new SessionError('No valid session found', 401);
		}
		
		return session as Session;
	} catch (error) {
		if (error instanceof SessionError) {
			throw error;
		}
		
		console.error('Session retrieval error:', error);
		throw new SessionError('Failed to retrieve session', 500);
	}
}

/**
 * Get session user with proper typing and error handling
 * 
 * @param event - SvelteKit request event
 * @returns Promise<SessionUser> - Typed user object
 * @throws SessionError - If session is invalid or missing
 */
export async function getSessionUser(event: RequestEvent): Promise<SessionUser> {
	const session = await getSession(event);
	return session.user;
}

/**
 * Get session user ID with proper typing and error handling
 * 
 * @param event - SvelteKit request event
 * @returns Promise<string> - User ID
 * @throws SessionError - If session is invalid or missing
 */
export async function getSessionUserId(event: RequestEvent): Promise<string> {
	const user = await getSessionUser(event);
	return user.id;
}

/**
 * Check if user is authenticated without throwing errors
 * 
 * @param event - SvelteKit request event
 * @returns Promise<boolean> - True if authenticated, false otherwise
 */
export async function isAuthenticated(event: RequestEvent): Promise<boolean> {
	try {
		await getSession(event);
		return true;
	} catch {
		return false;
	}
}

/**
 * Get session or return 401 JSON response
 * This is the main helper function for API routes
 * 
 * @param event - SvelteKit request event
 * @returns Promise<Session> - Typed session object
 * @throws Response - 401 JSON response if not authenticated
 */
export async function getSessionOrThrow(event: RequestEvent): Promise<Session> {
	try {
		return await getSession(event);
	} catch (error) {
		if (error instanceof SessionError) {
			throw json({ error: error.message }, { status: error.statusCode });
		}
		throw json({ error: 'Authentication failed' }, { status: 500 });
	}
}

/**
 * Standardized session helper that accepts locals parameter
 * This maintains backward compatibility while providing proper typing
 * 
 * @param locals - SvelteKit locals object (with request and supabase)
 * @returns Promise<Session> - Typed session object  
 * @throws Response - 401 JSON response if not authenticated
 */
export async function getSessionFromLocals(locals: any): Promise<Session> {
	try {
		// Handle test mode authentication header first
		if (locals.request?.headers) {
			const testUserId = locals.request.headers.get('x-test-user-id');
			if (testUserId && testUserId.trim() !== '') {
				// Create a complete mock session for testing
				const mockSession: Session = {
					user: {
						id: testUserId,
						email: `${testUserId}@example.com`,
						user_metadata: { full_name: `Test User ${testUserId}` },
						app_metadata: {},
						aud: 'authenticated',
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString()
					},
					access_token: `mock-access-token-${testUserId}`,
					refresh_token: `mock-refresh-token-${testUserId}`,
					expires_at: Date.now() + 3600000, // 1 hour from now
					expires_in: 3600,
					token_type: 'bearer'
				};
				return mockSession;
			}
		}

		const sessionResp = await locals.getSession();
		
		// Handle different response formats from getSession()
		const session = (sessionResp as any)?.data?.session 
			?? (sessionResp as any)?.session 
			?? null;
		
		if (!session || !session.user || !session.user.id) {
			throw new SessionError('No valid session found', 401);
		}
		
		return session as Session;
	} catch (error) {
		if (error instanceof SessionError) {
			throw json({ error: error.message }, { status: error.statusCode });
		}
		
		console.error('Session retrieval error:', error);
		throw json({ error: 'Authentication failed' }, { status: 500 });
	}
}

/**
 * Get session user from locals parameter
 * This maintains backward compatibility while providing proper typing
 * 
 * @param locals - SvelteKit locals object
 * @returns Promise<SessionUser> - Typed user object
 * @throws Response - 401 JSON response if not authenticated
 */
export async function getSessionUserFromLocals(locals: any): Promise<SessionUser> {
	const session = await getSessionFromLocals(locals);
	return session.user;
}

/**
 * Get session user or return 401 JSON response
 * This is the main helper function for API routes that need user data
 * 
 * @param event - SvelteKit request event
 * @returns Promise<SessionUser> - Typed user object
 * @throws Response - 401 JSON response if not authenticated
 */
export async function getSessionUserOrThrow(event: RequestEvent): Promise<SessionUser> {
	try {
		const session = await getSessionOrThrow(event);
		return session.user;
	} catch (error) {
		// Re-throw JSON responses from getSessionOrThrow
		if (error instanceof Response) {
			throw error;
		}
		throw json({ error: 'Authentication failed' }, { status: 500 });
	}
}

/**
 * Get session user ID or return 401 JSON response
 * This is the main helper function for API routes that need user ID
 * 
 * @param event - SvelteKit request event
 * @returns Promise<string> - User ID
 * @throws Response - 401 JSON response if not authenticated
 */
export async function getSessionUserIdOrThrow(event: RequestEvent): Promise<string> {
	try {
		const user = await getSessionUserOrThrow(event);
		return user.id;
	} catch (error) {
		// Re-throw JSON responses from getSessionUserOrThrow
		if (error instanceof Response) {
			throw error;
		}
		throw json({ error: 'Authentication failed' }, { status: 500 });
	}
}

/**
 * Validate that the authenticated user matches the provided user ID
 * 
 * @param event - SvelteKit request event
 * @param targetUserId - User ID to validate against
 * @throws Response - 403 JSON response if user doesn't match
 */
export async function validateUserAccess(event: RequestEvent, targetUserId: string): Promise<void> {
	const userId = await getSessionUserIdOrThrow(event);
	
	if (userId !== targetUserId) {
		throw json({ error: 'Forbidden' }, { status: 403 });
	}
}

/**
 * Validate that the authenticated user has access to a resource
 * 
 * @param event - SvelteKit request event
 * @param resourceOwnerId - Owner ID of the resource
 * @throws Response - 403 JSON response if user doesn't have access
 */
export async function validateResourceAccess(event: RequestEvent, resourceOwnerId: string): Promise<void> {
	await validateUserAccess(event, resourceOwnerId);
}

/**
 * Check if user is authenticated and return session or null
 * This is useful for optional authentication scenarios
 * 
 * @param event - SvelteKit request event
 * @returns Promise<Session | null> - Session if authenticated, null otherwise
 */
export async function getOptionalSession(event: RequestEvent): Promise<Session | null> {
	try {
		return await getSession(event);
	} catch {
		return null;
	}
}

/**
 * Check if user is authenticated and return user or null
 * This is useful for optional authentication scenarios
 * 
 * @param event - SvelteKit request event
 * @returns Promise<SessionUser | null> - User if authenticated, null otherwise
 */
export async function getOptionalSessionUser(event: RequestEvent): Promise<SessionUser | null> {
	try {
		const session = await getOptionalSession(event);
		return session?.user || null;
	} catch {
		return null;
	}
}

/**
 * Standardized API route authentication helper
 * Provides consistent session handling with proper error responses
 * 
 * @param event - SvelteKit request event
 * @returns Promise<{ user: SessionUser; session: Session }> - Authenticated user and session
 * @throws Response - 401 JSON response if not authenticated
 */
export async function authenticateApiRequest(event: RequestEvent): Promise<{ user: SessionUser; session: Session }> {
	try {
		// First check if session exists
		const session = await event.locals.getSession();
		if (!session) {
			throw json({ error: 'Not authenticated' }, { status: 401 });
		}

		// Get user from session
		const user = await getSessionUserOrThrow(event);
		
		return { user, session };
	} catch (error) {
		// Re-throw JSON responses from getSessionUserOrThrow
		if (error instanceof Response) {
			throw error;
		}
		throw json({ error: 'Authentication failed' }, { status: 500 });
	}
}

/**
 * Standardized API route authentication helper with admin check
 * Provides consistent session handling with admin privilege validation
 * 
 * @param event - SvelteKit request event
 * @returns Promise<{ user: SessionUser; session: Session }> - Authenticated admin user and session
 * @throws Response - 401 JSON response if not authenticated, 403 if not admin
 */
export async function authenticateAdminApiRequest(event: RequestEvent): Promise<{ user: SessionUser; session: Session }> {
	const { user, session } = await authenticateApiRequest(event);
	
	// Check admin privileges
	if (!user.app_metadata?.role || user.app_metadata.role !== 'admin') {
		throw json({ error: 'Insufficient permissions' }, { status: 403 });
	}
	
	return { user, session };
}
