import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    const session = await locals.getSession();
    if (!session) throw error(401, 'Unauthorized');
    const { data: me } = await locals.supabase.from('users').select('role').eq('id', session.user.id).single();
    if (!me || !['admin', 'moderator'].includes(me.role)) throw error(403, 'Forbidden');

    const state = url.searchParams.get('state');
    let query = locals.supabase
        .from('disputes')
        .select('*, orders!inner(id, buyer_id, seller_id)')
        .order('created_at', { ascending: false })
        .limit(100);
    if (state) query = query.eq('state', state);
    const { data: disputes, error: err } = await query;
    if (err) throw error(500, 'Failed to load disputes');
    return { disputes: disputes || [], state: state || '' };
};

export const actions: Actions = {
    async update({ request, locals }) {
        const session = await locals.getSession();
        if (!session) return fail(401, { message: 'Unauthorized' });
        const form = await request.formData();
        const id = form.get('id') as string;
        const state = form.get('state') as string;
        const decision = form.get('decision') as string | null;
        const refund_cents = form.get('refund_cents') ? Number(form.get('refund_cents')) : null;

        const { error: err } = await locals.supabase
            .from('disputes')
            .update({ state, decision, refund_cents, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (err) return fail(500, { message: 'Update failed' });
        return { ok: true };
    }
};


