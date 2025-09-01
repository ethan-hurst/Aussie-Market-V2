import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
    const session = await locals.getSession();
    if (!session) throw error(401, 'Unauthorized');
    const { data: me } = await locals.supabase.from('users').select('role').eq('id', session.user.id).single();
    if (!me || me.role !== 'admin') throw error(403, 'Forbidden');

    const { data: metrics } = await locals.supabase
        .from('metrics')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(100);
    return { metrics: metrics || [] };
};


