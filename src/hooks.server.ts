import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	// Temporarily disable Supabase SSR to test basic app functionality
	event.locals.getSession = async () => {
		return null;
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'x-sveltekit-action';
		}
	});
};
