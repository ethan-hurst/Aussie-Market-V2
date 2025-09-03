import { json } from '@sveltejs/kit';
import { mapApiErrorToMessage } from '$lib/errors';
import { supabase } from '$lib/supabase';
import type { RequestHandler } from './$types';
import { rateLimit } from '$lib/security';
import crypto from 'crypto';

function generateCode6(): string {
    // 6-digit numeric code
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function hash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
}

// Initialize pickup (seller only). Generates code6 and qr_token
export const POST: RequestHandler = async ({ params, request, locals }) => {
    try {
        const { data: { session } } = await locals.getSession();
        if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

        const { orderId } = params;
        if (!orderId) return json({ error: 'Order ID required' }, { status: 400 });

        const body = await request.json().catch(() => ({}));
        const action = body?.action || 'init';

        // Rate limit init/redeem to prevent brute-force
        const key = action === 'init' ? `pickup-init:${session.user.id}` : `pickup-redeem:${session.user.id}`;
        const windowMs = action === 'init' ? 10 * 60_000 : 60_000; // init less frequent
        const limit = action === 'init' ? 10 : 30; // allow more redeems
        const rl = rateLimit(key, limit, windowMs);
        if (!rl.allowed) {
            return json({ error: 'Too many requests. Please slow down.' }, { status: 429, headers: rl.retryAfterMs ? { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } : {} });
        }

        // Fetch order
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (orderError || !order) return json({ error: 'Order not found' }, { status: 404 });

        const userId = session.user.id;
        const isSeller = order.seller_id === userId;
        const isBuyer = order.buyer_id === userId;

        if (action === 'init') {
            if (!isSeller) return json({ error: 'Forbidden' }, { status: 403 });
            if (!(order.state === 'paid' || order.state === 'ready_for_handover')) {
                return json({ error: 'Order not ready for pickup' }, { status: 400 });
            }

            const code6 = generateCode6();
            const code6_hash = hash(code6);
            const qr_token = crypto.randomUUID();

            // Upsert pickup record
            const { data: pickup, error: upsertError } = await supabase
                .from('pickups')
                .upsert({
                    order_id: orderId,
                    code6_hash,
                    qr_token
                }, { onConflict: 'order_id' })
                .select()
                .single();

            if (upsertError) {
                console.error('Pickup upsert error:', upsertError);
                return json({ error: 'Failed to initialize pickup' }, { status: 500 });
            }

            return json({ success: true, code6, qr_token, pickup });
        }

        if (action === 'redeem') {
            // buyer or seller can redeem at handover location, but validate code/qr
            const { code6, qr_token } = body || {};
            if (!code6 && !qr_token) return json({ error: 'Provide code6 or qr_token' }, { status: 400 });

            const { data: pickup, error: pickupError } = await supabase
                .from('pickups')
                .select('*')
                .eq('order_id', orderId)
                .single();

            if (pickupError || !pickup) return json({ error: 'Pickup not initialized' }, { status: 404 });

            if (code6) {
                const ok = pickup.code6_hash === hash(code6);
                if (!ok) return json({ error: 'Invalid code' }, { status: 400 });
            } else if (qr_token) {
                if (pickup.qr_token !== qr_token) return json({ error: 'Invalid token' }, { status: 400 });
            }

            // Mark redeemed and update order to delivered
            const { error: updPickupErr } = await supabase
                .from('pickups')
                .update({ redeemed_by: userId, redeemed_at: new Date().toISOString() })
                .eq('order_id', orderId);

            if (updPickupErr) return json({ error: 'Failed to redeem' }, { status: 500 });

            const { error: updOrderErr } = await supabase
                .from('orders')
                .update({ state: 'delivered', updated_at: new Date().toISOString() })
                .eq('id', orderId);

            if (updOrderErr) return json({ error: 'Failed to update order' }, { status: 500 });

            return json({ success: true, state: 'delivered' });
        }

        return json({ error: 'Unsupported action' }, { status: 400 });
    } catch (error) {
        console.error('Pickup API error:', error);
        return json({ error: mapApiErrorToMessage(error) }, { status: 500 });
    }
};


