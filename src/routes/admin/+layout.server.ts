import type { LayoutServerLoad } from './$types';
import { redirect, error } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals, url }) => {
    const session = await locals.getSession();
    if (!session) {
        throw redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
    }

    const { data: user, error: userError } = await locals.supabase
        .from('users')
        .select('id, role, legal_name, email')
        .eq('id', session.user.id)
        .single();

    if (userError || !user) {
        throw error(500, 'Failed to load user profile');
    }

    if (!['admin', 'moderator'].includes(user.role)) {
        throw error(403, 'Forbidden');
    }

    return {
        session,
        userProfile: user
    };
};


