import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    const session = await locals.getSession();
    if (!session) throw error(401, 'Unauthorized');

    const { data: me } = await locals.supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single();

    if (!me || !['admin', 'moderator'].includes(me.role)) throw error(403, 'Forbidden');

    const q = url.searchParams.get('q') || '';
    let query = locals.supabase.from('users').select('id, email, legal_name, role, kyc, kyc_completed_at').order('created_at', { ascending: false }).limit(100);
    if (q) {
        query = query.ilike('email', `%${q}%`);
    }
    const { data: users, error: err } = await query;
    if (err) throw error(500, 'Failed to load users');
    return { users: users || [], q };
};


