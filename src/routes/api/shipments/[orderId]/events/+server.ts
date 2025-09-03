import { json } from '@sveltejs/kit';
import { mapApiErrorToMessage } from '$lib/errors';
import { supabase } from '$lib/supabase';
import type { RequestHandler } from './$types';
import { rateLimit } from '$lib/security';
import { validate, ShipmentEventSchema } from '$lib/validation';

// List shipment events for an order (buyer/seller)
export const GET: RequestHandler = async ({ params, locals }) => {
    try {
        const { data: { session } } = await locals.getSession();
        if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

        const { orderId } = params;
        if (!orderId) return json({ error: 'Order ID required' }, { status: 400 });

        // Find shipment id for order
        const { data: shipment } = await supabase
            .from('shipments')
            .select('id')
            .eq('order_id', orderId)
            .single();

        if (!shipment) return json({ events: [] });

        const { data: events, error } = await supabase
            .from('shipment_events')
            .select('*')
            .eq('shipment_id', shipment.id)
            .order('event_time', { ascending: false });

        if (error) return json({ error: 'Failed to fetch events' }, { status: 500 });
        return json({ events: events || [] });
    } catch (error) {
        console.error('List events error:', error);
        return json({ error: mapApiErrorToMessage(error) }, { status: 500 });
    }
};

// Add an event (seller only)
export const POST: RequestHandler = async ({ params, request, locals }) => {
    try {
        const { data: { session } } = await locals.getSession();
        if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

        // Limit tracking event writes per seller
        const rl = rateLimit(`shipment-event:${session.user.id}`, 60, 10 * 60_000);
        if (!rl.allowed) {
            return json({ error: 'Too many requests. Please slow down.' }, { status: 429, headers: rl.retryAfterMs ? { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } : {} });
        }

        const { orderId } = params;
        const body = await request.json();
        const parsed = validate(ShipmentEventSchema.extend({ event_time: (require('zod') as any).z.string().datetime().optional() }), body);
        if (!parsed.ok) {
            return json({ error: mapApiErrorToMessage(parsed.error) }, { status: 400 });
        }
        const { status, description, location, event_time } = parsed.value as any;

        // Ensure seller owns order and has a shipment
        const { data: shipment, error: shipErr } = await supabase
            .from('shipments')
            .select('id, order_id, orders!inner(seller_id)')
            .eq('order_id', orderId)
            .single();

        if (shipErr || !shipment) return json({ error: 'Shipment not found' }, { status: 404 });
        // RLS will protect inserts; we also pre-check
        // @ts-ignore - typed join
        if (shipment.orders?.seller_id && shipment.orders.seller_id !== session.user.id) {
            return json({ error: 'Forbidden' }, { status: 403 });
        }

        const { data: event, error } = await supabase
            .from('shipment_events')
            .insert({
                shipment_id: shipment.id,
                status,
                description,
                location,
                event_time: event_time || new Date().toISOString()
            })
            .select()
            .single();

        if (error) return json({ error: 'Failed to add event' }, { status: 500 });
        return json({ success: true, event });
    } catch (error) {
        console.error('Add event error:', error);
        return json({ error: mapApiErrorToMessage(error) }, { status: 500 });
    }
};


