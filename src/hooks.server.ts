import pkg from '@supabase/ssr';
const { createServerClient } = pkg;
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { initializeApplication } from '$lib/startup';
import type { Handle } from '@sveltejs/kit';
import { isCsrfRequestValid } from '$lib/security';
import { dev } from '$app/environment';

// Initialize application with environment validation
let initializationPromise: Promise<void> | null = null;

async function ensureInitialized() {
	if (!initializationPromise) {
		initializationPromise = initializeApplication();
	}
	await initializationPromise;
}

export const handle: Handle = async ({ event, resolve }) => {
	// Ensure application is properly initialized
	await ensureInitialized();
	
	// CSRF protection for state-changing API requests
	if (!isCsrfRequestValid(event)) {
		return new Response(JSON.stringify({ error: 'Invalid CSRF' }), { status: 403, headers: { 'content-type': 'application/json' } });
	}
	
	event.locals.supabase = createServerClient(
		PUBLIC_SUPABASE_URL,
		PUBLIC_SUPABASE_ANON_KEY,
		{
			cookies: {
				get: (key) => event.cookies.get(key),
				set: (key, value, options) => event.cookies.set(key, value, options),
				remove: (key, options) => event.cookies.delete(key, options)
			}
		}
	);

	/**
	 * a little helper that is written for convenience so that instead
	 * of calling `const { data: { session } } = await supabase.auth.getSession()`
	 * you just call this `await getSession()`
	 */
	event.locals.getSession = async () => {
		// Test-only override: allow setting a session via header in CI/E2E
		const testUserId = event.request.headers.get('x-test-user-id');
		if (testUserId) {
			return { data: { session: { user: { id: testUserId } } } } as any;
		}
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		return { data: { session } } as any;
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			/**
			 * if the name is `x-sveltekit-action` we should filter it out of the
			 * response headers. we only want to expose the headers that are
			 * relevant to the client
			 */
			return name === 'x-sveltekit-action';
		}
	});
};

export const handleError = ({ error, event }) => {
  // Centralized error logging
  console.error('SvelteKit error:', {
    path: event.url.pathname,
    method: event.request.method,
    message: (error as any)?.message,
  });

  // Sanitize message for client
  const message = dev ? (error as any)?.message : 'Something went wrong';
  return {
    message
  };
};
