import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import {
	getSession,
	getSessionUser,
	getSessionUserId,
	isAuthenticated,
	getSessionOrThrow,
	getSessionUserOrThrow,
	getSessionUserIdOrThrow,
	validateUserAccess,
	validateResourceAccess,
	getOptionalSession,
	getOptionalSessionUser,
	SessionError,
	type Session,
	type SessionUser
} from './session';

// Mock RequestEvent
const createMockEvent = (sessionResponse: any, headers?: Record<string, string>): RequestEvent => ({
	request: {
		headers: {
			get: vi.fn().mockImplementation((key: string) => headers?.[key] || null)
		}
	},
	locals: {
		getSession: vi.fn().mockResolvedValue(sessionResponse)
	}
} as any);

// Test data factories
const createMockUser = (overrides: Partial<SessionUser> = {}): SessionUser => ({
	id: 'test-user-123',
	email: 'test@example.com',
	user_metadata: {},
	app_metadata: {},
	aud: 'authenticated',
	created_at: '2023-01-01T00:00:00Z',
	updated_at: '2023-01-01T00:00:00Z',
	...overrides
});

const createMockSession = (userOverrides: Partial<SessionUser> = {}): Session => ({
	user: createMockUser(userOverrides),
	access_token: 'test-access-token',
	refresh_token: 'test-refresh-token',
	expires_at: Date.now() + 3600000, // 1 hour from now
	expires_in: 3600,
	token_type: 'bearer'
});

describe('Session Helper Functions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Suppress console.error for expected error cases
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('getSession', () => {
		it('should return session when valid session exists', async () => {
			// Arrange
			const mockSession = createMockSession();
			const event = createMockEvent({ data: { session: mockSession } });

			// Act
			const result = await getSession(event);

			// Assert
			expect(result).toEqual(mockSession);
			expect(event.locals.getSession).toHaveBeenCalledOnce();
		});

		it('should handle different session response formats', async () => {
			// Test format 1: { data: { session: ... } }
			const mockSession1 = createMockSession();
			const event1 = createMockEvent({ data: { session: mockSession1 } });
			expect(await getSession(event1)).toEqual(mockSession1);

			// Test format 2: { session: ... }
			const mockSession2 = createMockSession();
			const event2 = createMockEvent({ session: mockSession2 });
			expect(await getSession(event2)).toEqual(mockSession2);

			// Note: Direct session object format is not supported by current implementation
			// The session must be nested under 'data.session' or 'session' property
		});

		it('should throw SessionError when no session exists', async () => {
			// Arrange
			const event = createMockEvent({ data: { session: null } });

			// Act & Assert
			await expect(getSession(event)).rejects.toThrow(SessionError);
			await expect(getSession(event)).rejects.toThrow('No valid session found');
		});

		it('should throw SessionError when session has no user', async () => {
			// Arrange
			const event = createMockEvent({ data: { session: { user: null } } });

			// Act & Assert
			await expect(getSession(event)).rejects.toThrow(SessionError);
			await expect(getSession(event)).rejects.toThrow('No valid session found');
		});

		it('should throw SessionError when user has no ID', async () => {
			// Arrange
			const event = createMockEvent({ 
				data: { 
					session: { 
						user: { email: 'test@example.com' } // Missing id
					} 
				} 
			});

			// Act & Assert
			await expect(getSession(event)).rejects.toThrow(SessionError);
			await expect(getSession(event)).rejects.toThrow('No valid session found');
		});

		it('should handle getSession() throwing an error', async () => {
			// Arrange
			const event = createMockEvent(null);
			vi.mocked(event.locals.getSession).mockRejectedValue(new Error('Network error'));

			// Act & Assert
			await expect(getSession(event)).rejects.toThrow(SessionError);
			await expect(getSession(event)).rejects.toThrow('Failed to retrieve session');
		});

		it('should preserve SessionError when getSession() throws SessionError', async () => {
			// Arrange
			const event = createMockEvent(null);
			const originalError = new SessionError('Original error', 403);
			vi.mocked(event.locals.getSession).mockRejectedValue(originalError);

			// Act & Assert
			await expect(getSession(event)).rejects.toThrow(originalError);
		});

		it('should use x-test-user-id header when present', async () => {
			// Arrange
			const testUserId = 'test-user-456';
			const event = createMockEvent(null, { 'x-test-user-id': testUserId });

			// Act
			const result = await getSession(event);

			// Assert
			expect(result.user.id).toBe(testUserId);
			expect(result.user.email).toBe(`${testUserId}@example.com`);
			expect(result.access_token).toBe(`mock-access-token-${testUserId}`);
			expect(result.token_type).toBe('bearer');
			// Should not call actual getSession when using test header
			expect(event.locals.getSession).not.toHaveBeenCalled();
		});

		it('should fall back to regular session when x-test-user-id is empty', async () => {
			// Arrange
			const mockSession = createMockSession();
			const event = createMockEvent({ data: { session: mockSession } }, { 'x-test-user-id': '' });

			// Act
			const result = await getSession(event);

			// Assert
			expect(result).toEqual(mockSession);
			expect(event.locals.getSession).toHaveBeenCalledOnce();
		});

		it('should fall back to regular session when x-test-user-id header is not present', async () => {
			// Arrange
			const mockSession = createMockSession();
			const event = createMockEvent({ data: { session: mockSession } });

			// Act
			const result = await getSession(event);

			// Assert
			expect(result).toEqual(mockSession);
			expect(event.locals.getSession).toHaveBeenCalledOnce();
		});
	});

	describe('getSessionUser', () => {
		it('should return user from valid session', async () => {
			// Arrange
			const mockUser = createMockUser();
			const mockSession = createMockSession(mockUser);
			const event = createMockEvent({ data: { session: mockSession } });

			// Act
			const result = await getSessionUser(event);

			// Assert
			expect(result).toEqual(mockUser);
		});

		it('should throw SessionError when session is invalid', async () => {
			// Arrange
			const event = createMockEvent({ data: { session: null } });

			// Act & Assert
			await expect(getSessionUser(event)).rejects.toThrow(SessionError);
		});
	});

	describe('getSessionUserId', () => {
		it('should return user ID from valid session', async () => {
			// Arrange
			const mockUser = createMockUser({ id: 'user-456' });
			const mockSession = createMockSession(mockUser);
			const event = createMockEvent({ data: { session: mockSession } });

			// Act
			const result = await getSessionUserId(event);

			// Assert
			expect(result).toBe('user-456');
		});

		it('should throw SessionError when session is invalid', async () => {
			// Arrange
			const event = createMockEvent({ data: { session: null } });

			// Act & Assert
			await expect(getSessionUserId(event)).rejects.toThrow(SessionError);
		});
	});

	describe('isAuthenticated', () => {
		it('should return true when valid session exists', async () => {
			// Arrange
			const mockSession = createMockSession();
			const event = createMockEvent({ data: { session: mockSession } });

			// Act
			const result = await isAuthenticated(event);

			// Assert
			expect(result).toBe(true);
		});

		it('should return false when no session exists', async () => {
			// Arrange
			const event = createMockEvent({ data: { session: null } });

			// Act
			const result = await isAuthenticated(event);

			// Assert
			expect(result).toBe(false);
		});

		it('should return false when session is invalid', async () => {
			// Arrange
			const event = createMockEvent({ data: { session: { user: null } } });

			// Act
			const result = await isAuthenticated(event);

			// Assert
			expect(result).toBe(false);
		});

		it('should return false when getSession() throws error', async () => {
			// Arrange
			const event = createMockEvent(null);
			vi.mocked(event.locals.getSession).mockRejectedValue(new Error('Network error'));

			// Act
			const result = await isAuthenticated(event);

			// Assert
			expect(result).toBe(false);
		});
	});

	describe('getSessionOrThrow', () => {
		it('should return session when valid session exists', async () => {
			// Arrange
			const mockSession = createMockSession();
			const event = createMockEvent({ data: { session: mockSession } });

			// Act
			const result = await getSessionOrThrow(event);

			// Assert
			expect(result).toEqual(mockSession);
		});

		it('should throw 401 JSON response when SessionError with 401 status', async () => {
			// Arrange
			const event = createMockEvent({ data: { session: null } });

			// Act & Assert
			await expect(getSessionOrThrow(event)).rejects.toThrow();
			
			try {
				await getSessionOrThrow(event);
			} catch (error) {
				expect(error).toBeInstanceOf(Response);
				expect((error as Response).status).toBe(401);
			}
		});

		it('should throw 500 JSON response when SessionError with 500 status', async () => {
			// Arrange
			const event = createMockEvent(null);
			vi.mocked(event.locals.getSession).mockRejectedValue(new SessionError('Server error', 500));

			// Act & Assert
			await expect(getSessionOrThrow(event)).rejects.toThrow();
			
			try {
				await getSessionOrThrow(event);
			} catch (error) {
				expect(error).toBeInstanceOf(Response);
				expect((error as Response).status).toBe(500);
			}
		});

		it('should throw 500 JSON response when non-SessionError occurs', async () => {
			// Arrange
			const event = createMockEvent(null);
			vi.mocked(event.locals.getSession).mockRejectedValue(new Error('Network error'));

			// Act & Assert
			await expect(getSessionOrThrow(event)).rejects.toThrow();
			
			try {
				await getSessionOrThrow(event);
			} catch (error) {
				expect(error).toBeInstanceOf(Response);
				expect((error as Response).status).toBe(500);
			}
		});
	});

	describe('getSessionUserOrThrow', () => {
		it('should return user when valid session exists', async () => {
			// Arrange
			const mockUser = createMockUser();
			const mockSession = createMockSession(mockUser);
			const event = createMockEvent({ data: { session: mockSession } });

			// Act
			const result = await getSessionUserOrThrow(event);

			// Assert
			expect(result).toEqual(mockUser);
		});

		it('should throw 401 JSON response when session is invalid', async () => {
			// Arrange
			const event = createMockEvent({ data: { session: null } });

			// Act & Assert
			await expect(getSessionUserOrThrow(event)).rejects.toThrow();
			
			try {
				await getSessionUserOrThrow(event);
			} catch (error) {
				expect(error).toBeInstanceOf(Response);
				expect((error as Response).status).toBe(401);
			}
		});

		it('should re-throw Response from getSessionOrThrow', async () => {
			// Arrange
			const event = createMockEvent(null);
			vi.mocked(event.locals.getSession).mockRejectedValue(new Error('Network error'));

			// Act & Assert
			await expect(getSessionUserOrThrow(event)).rejects.toThrow();
			
			try {
				await getSessionUserOrThrow(event);
			} catch (error) {
				expect(error).toBeInstanceOf(Response);
				expect((error as Response).status).toBe(500);
			}
		});
	});

	describe('getSessionUserIdOrThrow', () => {
		it('should return user ID when valid session exists', async () => {
			// Arrange
			const mockUser = createMockUser({ id: 'user-789' });
			const mockSession = createMockSession(mockUser);
			const event = createMockEvent({ data: { session: mockSession } });

			// Act
			const result = await getSessionUserIdOrThrow(event);

			// Assert
			expect(result).toBe('user-789');
		});

		it('should throw 401 JSON response when session is invalid', async () => {
			// Arrange
			const event = createMockEvent({ data: { session: null } });

			// Act & Assert
			await expect(getSessionUserIdOrThrow(event)).rejects.toThrow();
			
			try {
				await getSessionUserIdOrThrow(event);
			} catch (error) {
				expect(error).toBeInstanceOf(Response);
				expect((error as Response).status).toBe(401);
			}
		});

		it('should re-throw Response from getSessionUserOrThrow', async () => {
			// Arrange
			const event = createMockEvent(null);
			vi.mocked(event.locals.getSession).mockRejectedValue(new Error('Network error'));

			// Act & Assert
			await expect(getSessionUserIdOrThrow(event)).rejects.toThrow();
			
			try {
				await getSessionUserIdOrThrow(event);
			} catch (error) {
				expect(error).toBeInstanceOf(Response);
				expect((error as Response).status).toBe(500);
			}
		});
	});

	describe('validateUserAccess', () => {
		it('should not throw when user ID matches', async () => {
			// Arrange
			const mockUser = createMockUser({ id: 'user-123' });
			const mockSession = createMockSession(mockUser);
			const event = createMockEvent({ data: { session: mockSession } });

			// Act & Assert
			await expect(validateUserAccess(event, 'user-123')).resolves.not.toThrow();
		});

		it('should throw 403 JSON response when user ID does not match', async () => {
			// Arrange
			const mockUser = createMockUser({ id: 'user-123' });
			const mockSession = createMockSession(mockUser);
			const event = createMockEvent({ data: { session: mockSession } });

			// Act & Assert
			await expect(validateUserAccess(event, 'user-456')).rejects.toThrow();
			
			try {
				await validateUserAccess(event, 'user-456');
			} catch (error) {
				expect(error).toBeInstanceOf(Response);
				expect((error as Response).status).toBe(403);
			}
		});

		it('should throw 401 JSON response when session is invalid', async () => {
			// Arrange
			const event = createMockEvent({ data: { session: null } });

			// Act & Assert
			await expect(validateUserAccess(event, 'user-123')).rejects.toThrow();
			
			try {
				await validateUserAccess(event, 'user-123');
			} catch (error) {
				expect(error).toBeInstanceOf(Response);
				expect((error as Response).status).toBe(401);
			}
		});
	});

	describe('validateResourceAccess', () => {
		it('should call validateUserAccess with resource owner ID', async () => {
			// Arrange
			const mockUser = createMockUser({ id: 'user-123' });
			const mockSession = createMockSession(mockUser);
			const event = createMockEvent({ data: { session: mockSession } });

			// Act & Assert
			await expect(validateResourceAccess(event, 'user-123')).resolves.not.toThrow();
			await expect(validateResourceAccess(event, 'user-456')).rejects.toThrow();
		});
	});

	describe('getOptionalSession', () => {
		it('should return session when valid session exists', async () => {
			// Arrange
			const mockSession = createMockSession();
			const event = createMockEvent({ data: { session: mockSession } });

			// Act
			const result = await getOptionalSession(event);

			// Assert
			expect(result).toEqual(mockSession);
		});

		it('should return null when no session exists', async () => {
			// Arrange
			const event = createMockEvent({ data: { session: null } });

			// Act
			const result = await getOptionalSession(event);

			// Assert
			expect(result).toBeNull();
		});

		it('should return null when session is invalid', async () => {
			// Arrange
			const event = createMockEvent({ data: { session: { user: null } } });

			// Act
			const result = await getOptionalSession(event);

			// Assert
			expect(result).toBeNull();
		});

		it('should return null when getSession() throws error', async () => {
			// Arrange
			const event = createMockEvent(null);
			vi.mocked(event.locals.getSession).mockRejectedValue(new Error('Network error'));

			// Act
			const result = await getOptionalSession(event);

			// Assert
			expect(result).toBeNull();
		});
	});

	describe('getOptionalSessionUser', () => {
		it('should return user when valid session exists', async () => {
			// Arrange
			const mockUser = createMockUser();
			const mockSession = createMockSession(mockUser);
			const event = createMockEvent({ data: { session: mockSession } });

			// Act
			const result = await getOptionalSessionUser(event);

			// Assert
			expect(result).toEqual(mockUser);
		});

		it('should return null when no session exists', async () => {
			// Arrange
			const event = createMockEvent({ data: { session: null } });

			// Act
			const result = await getOptionalSessionUser(event);

			// Assert
			expect(result).toBeNull();
		});

		it('should return null when session has no user', async () => {
			// Arrange
			const event = createMockEvent({ data: { session: { user: null } } });

			// Act
			const result = await getOptionalSessionUser(event);

			// Assert
			expect(result).toBeNull();
		});

		it('should return null when getSession() throws error', async () => {
			// Arrange
			const event = createMockEvent(null);
			vi.mocked(event.locals.getSession).mockRejectedValue(new Error('Network error'));

			// Act
			const result = await getOptionalSessionUser(event);

			// Assert
			expect(result).toBeNull();
		});
	});

	describe('SessionError', () => {
		it('should create SessionError with default 401 status', () => {
			// Act
			const error = new SessionError('Test error');

			// Assert
			expect(error.message).toBe('Test error');
			expect(error.statusCode).toBe(401);
			expect(error.name).toBe('SessionError');
		});

		it('should create SessionError with custom status code', () => {
			// Act
			const error = new SessionError('Test error', 403);

			// Assert
			expect(error.message).toBe('Test error');
			expect(error.statusCode).toBe(403);
			expect(error.name).toBe('SessionError');
		});
	});
});
