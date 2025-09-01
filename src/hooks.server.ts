import pkg from '@supabase/ssr';
const { createServerClient } = pkg;
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { initializeApplication } from '$lib/startup';
import type { Handle } from '@sveltejs/kit';

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
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		return session;
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
