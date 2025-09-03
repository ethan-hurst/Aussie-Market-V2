import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { mapApiErrorToMessage } from '$lib/errors';

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		const formData = await request.formData();
		const email = formData.get('email') as string;
		const password = formData.get('password') as string;
		const action = formData.get('action') as string;

		if (!email || !password) {
			return fail(400, {
				error: 'Email and password are required',
				email
			});
		}

		try {
			if (action === 'signup') {
				const { error } = await locals.supabase.auth.signUp({
					email,
					password,
					options: {
						emailRedirectTo: `${url.origin}/auth/callback`
					}
				});

				if (error) {
					return fail(400, {
						error: mapApiErrorToMessage(error),
						email
					});
				}

				return {
					success: 'Check your email for a confirmation link!',
					email
				};
			} else {
				const { error } = await locals.supabase.auth.signInWithPassword({
					email,
					password
				});

				if (error) {
					return fail(400, {
						error: mapApiErrorToMessage(error),
						email
					});
				}

				// Redirect to the intended page or home
				const redirectTo = url.searchParams.get('redirectTo') || '/';
				throw redirect(303, redirectTo);
			}
		} catch (err) {
			if (err instanceof Response) {
				throw err;
			}
			return fail(500, {
				error: mapApiErrorToMessage(err),
				email
			});
		}
	}
};
