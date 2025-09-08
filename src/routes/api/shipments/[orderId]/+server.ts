import { json } from '@sveltejs/kit';
import { mapApiErrorToMessage } from '$lib/errors';
import { supabase } from '$lib/supabase';
import type { RequestHandler } from './$types';
import { validate, ShipmentUpsertSchema } from '$lib/validation';
import { getSessionUserOrThrow } from '$lib/session';

// Create or update manual shipment info for an order (seller only)
export const POST: RequestHandler = async ({ params, request, locals }) => {
    try {
        // Get authenticated user with proper error handling
        const user = await getSessionUserOrThrow({ request, locals } as any);

        const { orderId } = params;
        if (!orderId) return json({ error: 'Order ID required' }, { status: 400 });

        const parsed = validate(ShipmentUpsertSchema, await request.json());
        if (!parsed.ok) return json({ error: mapApiErrorToMessage(parsed.error) }, { status: 400 });
        const { carrier, tracking, label_url } = parsed.value as any;

        // Verify order and permissions
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (orderError || !order) return json({ error: 'Order not found' }, { status: 404 });
        if (order.seller_id !== user.id) return json({ error: 'Forbidden' }, { status: 403 });

        // Upsert shipment
        const { data: shipment, error: shipError } = await supabase
            .from('shipments')
            .upsert({ order_id: orderId, carrier, tracking, label_url })
            .select()
            .single();

        if (shipError) return json({ error: 'Failed to save shipment' }, { status: 500 });

        // Mark order as shipped if not already
        if (order.state !== 'shipped') {
            await supabase
                .from('orders')
                .update({ state: 'shipped', updated_at: new Date().toISOString() })
                .eq('id', orderId);
        }

        return json({ success: true, shipment });
    } catch (error) {
        console.error('Shipment API error:', error);
        return json({ error: mapApiErrorToMessage(error) }, { status: 500 });
    }
};


