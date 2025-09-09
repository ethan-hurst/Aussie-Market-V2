import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getOptionalSession } from '$lib/session';

export const load: LayoutServerLoad = async ({ locals, url, request }) => {
	// Get session using the proper session helper that handles test headers
	const session = await getOptionalSession({ locals, request, url, params: {}, route: { id: '' } });

	// If no session and trying to access protected routes, redirect to login
	if (!session) {
		const protectedRoutes = ['/account', '/sell', '/orders', '/messages', '/admin'];
		const isProtectedRoute = protectedRoutes.some(route => url.pathname.startsWith(route));
		
		if (isProtectedRoute) {
			throw redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
		}
	}

	// If session exists, get user profile
	let userProfile = null;
	if (session) {
		const { data: profile } = await locals.supabase
			.from('users')
			.select('*')
			.eq('id', session.user.id)
			.single();
		
		userProfile = profile;
	}

	return {
		session,
		userProfile,
		url: url.pathname
	};
};
