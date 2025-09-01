import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
    const session = await locals.getSession();
    if (!session) throw error(401, 'Unauthorized');

    const { data: me } = await locals.supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single();

    if (!me || !['admin', 'moderator'].includes(me.role)) throw error(403, 'Forbidden');

    const { data: orders, error: err } = await locals.supabase
        .from('orders')
        .select('*, buyer:users!orders_buyer_id_fkey(legal_name,email), seller:users!orders_seller_id_fkey(legal_name,email)')
        .order('created_at', { ascending: false })
        .limit(100);

    if (err) throw error(500, 'Failed to load orders');

    return { orders: orders || [] };
};


