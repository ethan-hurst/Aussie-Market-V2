import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	const code = url.searchParams.get('code');
	const next = url.searchParams.get('next') ?? '/';

	if (code) {
		const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			// Get the user after successful authentication
			const { data: { user } } = await locals.supabase.auth.getUser();
			
			if (user) {
				// Check if user profile exists, create if not
				const { data: existingProfile } = await locals.supabase
					.from('users')
					.select('id')
					.eq('id', user.id)
					.single();

				if (!existingProfile) {
					// Create user profile
					await locals.supabase
						.from('users')
						.insert({
							id: user.id,
							email: user.email,
							role: 'buyer', // Default role
							kyc: 'none'
						});
				}
			}
		}
	}

	throw redirect(303, next);
};
