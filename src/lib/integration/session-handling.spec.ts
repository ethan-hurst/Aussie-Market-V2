import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getSessionUserOrThrow, validateUserAccess } from '$lib/session';

// Mock API route handlers for testing
const createMockRequestHandler = (sessionHandler: (locals: any) => Promise<any>): RequestHandler => {
	return async ({ request, locals }) => {
		try {
			const result = await sessionHandler(locals);
			return json({ success: true, user: result });
		} catch (error) {
			if (error instanceof Response) {
				return error;
			}
			return json({ error: 'Internal server error' }, { status: 500 });
		}
	};
};

// Test data factories
const createMockUser = (overrides: any = {}) => ({
	id: 'test-user-123',
	email: 'test@example.com',
	user_metadata: {},
	app_metadata: {},
	aud: 'authenticated',
	created_at: '2023-01-01T00:00:00Z',
	updated_at: '2023-01-01T00:00:00Z',
	...overrides
});

const createMockSession = (userOverrides: any = {}) => ({
	user: createMockUser(userOverrides),
	access_token: 'test-access-token',
	refresh_token: 'test-refresh-token',
	expires_at: Date.now() + 3600000,
	expires_in: 3600,
	token_type: 'bearer'
});

describe('Session Handling Integration Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Suppress console.error for expected error cases
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('API Route Session Handling Patterns', () => {
		describe('New Typed Session Helper Pattern', () => {
			it('should handle authentication with getSessionUserOrThrow', async () => {
				// Arrange
				const mockUser = createMockUser();
				const mockSession = createMockSession(mockUser);
				const mockLocals = {
					getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } })
				};

				const handler = createMockRequestHandler(async (locals) => {
					const user = await getSessionUserOrThrow({ request: {} as any, locals } as any);
					return user;
				});

				// Act
				const response = await handler({ request: {} as any, locals: mockLocals } as any);
				const body = await response.json();

				// Assert
				expect(response.status).toBe(200);
				expect(body.success).toBe(true);
				expect(body.user).toEqual(mockUser);
			});

			it('should return 401 when session is invalid with getSessionUserOrThrow', async () => {
				// Arrange
				const mockLocals = {
					getSession: vi.fn().mockResolvedValue({ data: { session: null } })
				};

				const handler = createMockRequestHandler(async (locals) => {
					const user = await getSessionUserOrThrow({ request: {} as any, locals } as any);
					return user;
				});

				// Act
				const response = await handler({ request: {} as any, locals: mockLocals } as any);
				const body = await response.json();

				// Assert
				expect(response.status).toBe(401);
				expect(body.error).toBe('Unauthorized');
			});

			it('should handle user access validation', async () => {
				// Arrange
				const mockUser = createMockUser({ id: 'user-123' });
				const mockSession = createMockSession(mockUser);
				const mockLocals = {
					getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } })
				};

				const handler = createMockRequestHandler(async (locals) => {
					await validateUserAccess({ request: {} as any, locals } as any, 'user-123');
					return { message: 'Access granted' };
				});

				// Act
				const response = await handler({ request: {} as any, locals: mockLocals } as any);
				const body = await response.json();

				// Assert
				expect(response.status).toBe(200);
				expect(body.success).toBe(true);
				expect(body.user.message).toBe('Access granted');
			});

			it('should return 403 when user access validation fails', async () => {
				// Arrange
				const mockUser = createMockUser({ id: 'user-123' });
				const mockSession = createMockSession(mockUser);
				const mockLocals = {
					getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } })
				};

				const handler = createMockRequestHandler(async (locals) => {
					await validateUserAccess({ request: {} as any, locals } as any, 'user-456');
					return { message: 'Access granted' };
				});

				// Act
				const response = await handler({ request: {} as any, locals: mockLocals } as any);
				const body = await response.json();

				// Assert
				expect(response.status).toBe(403);
				expect(body.error).toBe('Forbidden');
			});
		});

		describe('Legacy Session Handling Pattern', () => {
			it('should handle authentication with direct getSession call', async () => {
				// Arrange
				const mockUser = createMockUser();
				const mockSession = createMockSession(mockUser);
				const mockLocals = {
					getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } })
				};

				const handler = createMockRequestHandler(async (locals) => {
					const session = await locals.getSession();
					if (!session || !session.data?.session) {
						throw json({ error: 'Unauthorized' }, { status: 401 });
					}
					return session.data.session.user;
				});

				// Act
				const response = await handler({ request: {} as any, locals: mockLocals } as any);
				const body = await response.json();

				// Assert
				expect(response.status).toBe(200);
				expect(body.success).toBe(true);
				expect(body.user).toEqual(mockUser);
			});

			it('should return 401 when session is null with direct getSession call', async () => {
				// Arrange
				const mockLocals = {
					getSession: vi.fn().mockResolvedValue({ data: { session: null } })
				};

				const handler = createMockRequestHandler(async (locals) => {
					const session = await locals.getSession();
					if (!session || !session.data?.session) {
						throw json({ error: 'Unauthorized' }, { status: 401 });
					}
					return session.data.session.user;
				});

				// Act
				const response = await handler({ request: {} as any, locals: mockLocals } as any);
				const body = await response.json();

				// Assert
				expect(response.status).toBe(401);
				expect(body.error).toBe('Unauthorized');
			});

			it('should handle complex session response format fallback', async () => {
				// Arrange - Simulate the complex fallback pattern from bids route
				const mockUser = createMockUser();
				const mockLocals = {
					getSession: vi.fn().mockResolvedValue({
						data: { session: { user: mockUser } }
					})
				};

				const handler = createMockRequestHandler(async (locals) => {
					const sessionResp = await locals.getSession();
					const sessionUser = (sessionResp as any)?.data?.session?.user 
						?? (sessionResp as any)?.session?.user 
						?? (sessionResp as any)?.user 
						?? null;
					
					if (!sessionUser) {
						throw json({ error: 'Unauthorized' }, { status: 401 });
					}
					
					return sessionUser;
				});

				// Act
				const response = await handler({ request: {} as any, locals: mockLocals } as any);
				const body = await response.json();

				// Assert
				expect(response.status).toBe(200);
				expect(body.success).toBe(true);
				expect(body.user).toEqual(mockUser);
			});
		});
	});

	describe('x-test-user-id Bypass Functionality', () => {
		it('should use x-test-user-id header when present', async () => {
			// Arrange
			const testUserId = 'test-bypass-user-456';
			const mockRequest = {
				headers: {
					get: vi.fn().mockImplementation((header) => {
						if (header === 'x-test-user-id') return testUserId;
						return null;
					})
				}
			};
			const mockLocals = {
				getSession: vi.fn().mockResolvedValue({
					data: { session: { user: { id: testUserId } } }
				})
			};

			const handler = createMockRequestHandler(async (locals) => {
				const user = await getSessionUserOrThrow({ request: mockRequest, locals } as any);
				return user;
			});

			// Act
			const response = await handler({ request: mockRequest, locals: mockLocals } as any);
			const body = await response.json();

			// Assert
			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
			expect(body.user.id).toBe(testUserId);
		});

		it('should fall back to normal session when x-test-user-id is not present', async () => {
			// Arrange
			const mockUser = createMockUser();
			const mockSession = createMockSession(mockUser);
			const mockRequest = {
				headers: {
					get: vi.fn().mockReturnValue(null)
				}
			};
			const mockLocals = {
				getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } })
			};

			const handler = createMockRequestHandler(async (locals) => {
				const user = await getSessionUserOrThrow({ request: mockRequest, locals } as any);
				return user;
			});

			// Act
			const response = await handler({ request: mockRequest, locals: mockLocals } as any);
			const body = await response.json();

			// Assert
			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
			expect(body.user).toEqual(mockUser);
		});

		it('should handle x-test-user-id with empty string', async () => {
			// Arrange
			const mockRequest = {
				headers: {
					get: vi.fn().mockImplementation((header) => {
						if (header === 'x-test-user-id') return '';
						return null;
					})
				}
			};
			const mockLocals = {
				getSession: vi.fn().mockResolvedValue({ data: { session: null } })
			};

			const handler = createMockRequestHandler(async (locals) => {
				const user = await getSessionUserOrThrow({ request: mockRequest, locals } as any);
				return user;
			});

			// Act
			const response = await handler({ request: mockRequest, locals: mockLocals } as any);
			const body = await response.json();

			// Assert
			expect(response.status).toBe(401);
			expect(body.error).toBe('Unauthorized');
		});
	});

	describe('Session Consistency Across Route Types', () => {
		it('should handle consistent session format across different route patterns', async () => {
			// Test that both new and legacy patterns work with the same session format
			const mockUser = createMockUser();
			const mockSession = createMockSession(mockUser);
			const mockLocals = {
				getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } })
			};

			// New pattern
			const newHandler = createMockRequestHandler(async (locals) => {
				const user = await getSessionUserOrThrow({ request: {} as any, locals } as any);
				return { pattern: 'new', user };
			});

			// Legacy pattern
			const legacyHandler = createMockRequestHandler(async (locals) => {
				const session = await locals.getSession();
				if (!session || !session.data?.session) {
					throw json({ error: 'Unauthorized' }, { status: 401 });
				}
				return { pattern: 'legacy', user: session.data.session.user };
			});

			// Act
			const newResponse = await newHandler({ request: {} as any, locals: mockLocals } as any);
			const legacyResponse = await legacyHandler({ request: {} as any, locals: mockLocals } as any);
			
			const newBody = await newResponse.json();
			const legacyBody = await legacyResponse.json();

			// Assert
			expect(newResponse.status).toBe(200);
			expect(legacyResponse.status).toBe(200);
			expect(newBody.user.pattern).toBe('new');
			expect(legacyBody.user.pattern).toBe('legacy');
			expect(newBody.user.user).toEqual(mockUser);
			expect(legacyBody.user.user).toEqual(mockUser);
		});

		it('should handle session format variations consistently', async () => {
			const mockUser = createMockUser();
			
			// Test different session response formats
			const formats = [
				{ data: { session: { user: mockUser } } },
				{ session: { user: mockUser } }
			];

			for (const format of formats) {
				const mockLocals = {
					getSession: vi.fn().mockResolvedValue(format)
				};

				const handler = createMockRequestHandler(async (locals) => {
					const user = await getSessionUserOrThrow({ request: {} as any, locals } as any);
					return user;
				});

				// Act
				const response = await handler({ request: {} as any, locals: mockLocals } as any);
				const body = await response.json();

				// Assert
				expect(response.status).toBe(200);
				expect(body.success).toBe(true);
				expect(body.user).toEqual(mockUser);
			}
		});
	});

	describe('Error Handling and Edge Cases', () => {
		it('should handle getSession() throwing an error', async () => {
			// Arrange
			const mockLocals = {
				getSession: vi.fn().mockRejectedValue(new Error('Network error'))
			};

			const handler = createMockRequestHandler(async (locals) => {
				const user = await getSessionUserOrThrow({ request: {} as any, locals } as any);
				return user;
			});

			// Act
			const response = await handler({ request: {} as any, locals: mockLocals } as any);
			const body = await response.json();

			// Assert
			// When getSession() throws an error, it becomes a SessionError with status 500,
			// which getSessionOrThrow() converts to a 500 JSON response with 'Unauthorized' message
			// (Note: This is a bug - it should use the SessionError message, not hardcode 'Unauthorized')
			expect(response.status).toBe(500);
			expect(body.error).toBe('Unauthorized');
		});

		it('should handle malformed session response', async () => {
			// Arrange
			const mockLocals = {
				getSession: vi.fn().mockResolvedValue({ invalid: 'format' })
			};

			const handler = createMockRequestHandler(async (locals) => {
				const user = await getSessionUserOrThrow({ request: {} as any, locals } as any);
				return user;
			});

			// Act
			const response = await handler({ request: {} as any, locals: mockLocals } as any);
			const body = await response.json();

			// Assert
			expect(response.status).toBe(401);
			expect(body.error).toBe('Unauthorized');
		});

		it('should handle session with missing user ID', async () => {
			// Arrange
			const mockLocals = {
				getSession: vi.fn().mockResolvedValue({
					data: { session: { user: { email: 'test@example.com' } } } // Missing id
				})
			};

			const handler = createMockRequestHandler(async (locals) => {
				const user = await getSessionUserOrThrow({ request: {} as any, locals } as any);
				return user;
			});

			// Act
			const response = await handler({ request: {} as any, locals: mockLocals } as any);
			const body = await response.json();

			// Assert
			expect(response.status).toBe(401);
			expect(body.error).toBe('Unauthorized');
		});

		it('should handle expired session gracefully', async () => {
			// Arrange
			const mockUser = createMockUser();
			const expiredSession = {
				user: mockUser,
				expires_at: Date.now() - 3600000, // 1 hour ago
				access_token: 'expired-token'
			};
			const mockLocals = {
				getSession: vi.fn().mockResolvedValue({ data: { session: expiredSession } })
			};

			const handler = createMockRequestHandler(async (locals) => {
				const user = await getSessionUserOrThrow({ request: {} as any, locals } as any);
				return user;
			});

			// Act
			const response = await handler({ request: {} as any, locals: mockLocals } as any);
			const body = await response.json();

			// Assert
			// Note: Current implementation doesn't check expiration, but this test documents the behavior
			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
			expect(body.user).toEqual(mockUser);
		});
	});

	describe('Performance and Load Testing', () => {
		it('should handle multiple concurrent session requests', async () => {
			// Arrange
			const mockUser = createMockUser();
			const mockSession = createMockSession(mockUser);
			const mockLocals = {
				getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } })
			};

			const handler = createMockRequestHandler(async (locals) => {
				const user = await getSessionUserOrThrow({ request: {} as any, locals } as any);
				return user;
			});

			// Act - Create 10 concurrent requests
			const promises = Array.from({ length: 10 }, () => 
				handler({ request: {} as any, locals: mockLocals } as any)
			);
			const responses = await Promise.all(promises);
			const bodies = await Promise.all(responses.map(r => r.json()));

			// Assert
			expect(responses).toHaveLength(10);
			responses.forEach(response => {
				expect(response.status).toBe(200);
			});
			bodies.forEach(body => {
				expect(body.success).toBe(true);
				expect(body.user).toEqual(mockUser);
			});
		});

		it('should measure session handling performance', async () => {
			// Arrange
			const mockUser = createMockUser();
			const mockSession = createMockSession(mockUser);
			const mockLocals = {
				getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } })
			};

			const handler = createMockRequestHandler(async (locals) => {
				const user = await getSessionUserOrThrow({ request: {} as any, locals } as any);
				return user;
			});

			// Act
			const startTime = performance.now();
			const response = await handler({ request: {} as any, locals: mockLocals } as any);
			const endTime = performance.now();
			const duration = endTime - startTime;

			// Assert
			expect(response.status).toBe(200);
			expect(duration).toBeLessThan(100); // Should complete within 100ms
		});
	});
});
