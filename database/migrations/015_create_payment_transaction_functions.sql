-- Create payment transaction functions for atomic payment processing
-- This ensures all payment-related operations succeed or fail together

-- Function to confirm payment with atomic transaction
CREATE OR REPLACE FUNCTION confirm_payment_transaction(
    order_id UUID,
    payment_intent_id TEXT,
    amount_cents INTEGER,
    user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    order_record RECORD;
    result JSON;
BEGIN
    -- Start transaction (implicit in function)
    
    -- Get order details with row lock to prevent race conditions
    SELECT * INTO order_record
    FROM orders 
    WHERE id = order_id 
    FOR UPDATE;
    
    -- Check if order exists
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Order not found');
    END IF;
    
    -- Check if order is in correct state for payment
    IF order_record.state NOT IN ('pending', 'pending_payment') THEN
        RETURN json_build_object('success', false, 'error', 'Order cannot be paid for in current state');
    END IF;
    
    -- Check if user is the buyer
    IF order_record.buyer_id != user_id THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;
    
    -- Update order state to paid
    UPDATE orders 
    SET 
        state = 'paid',
        stripe_payment_intent_id = payment_intent_id,
        paid_at = NOW(),
        updated_at = NOW()
    WHERE id = order_id;
    
    -- Create payment record
    INSERT INTO payments (
        order_id,
        amount_cents,
        currency,
        payment_method,
        stripe_payment_intent_id,
        status,
        processed_at
    ) VALUES (
        order_id,
        amount_cents,
        'aud',
        'stripe',
        payment_intent_id,
        'completed',
        NOW()
    );
    
    -- Create ledger entry
    INSERT INTO ledger_entries (
        order_id,
        user_id,
        amount_cents,
        entry_type,
        description,
        created_at
    ) VALUES (
        order_id,
        user_id,
        amount_cents,
        'PAYMENT_RECEIVED',
        'Payment received for order ' || order_id,
        NOW()
    );
    
    -- Return success
    RETURN json_build_object('success', true, 'order_id', order_id);
    
EXCEPTION
    WHEN OTHERS THEN
        -- Rollback is automatic in function
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Function to process refund with atomic transaction
CREATE OR REPLACE FUNCTION process_refund_transaction(
    order_id UUID,
    refund_amount_cents INTEGER,
    refund_reason TEXT,
    user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    order_record RECORD;
    result JSON;
BEGIN
    -- Get order details with row lock
    SELECT * INTO order_record
    FROM orders 
    WHERE id = order_id 
    FOR UPDATE;
    
    -- Check if order exists
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Order not found');
    END IF;
    
    -- Check if order is in correct state for refund
    IF order_record.state NOT IN ('paid', 'completed') THEN
        RETURN json_build_object('success', false, 'error', 'Order cannot be refunded in current state');
    END IF;
    
    -- Check if user is authorized (buyer or seller)
    IF order_record.buyer_id != user_id AND order_record.seller_id != user_id THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;
    
    -- Update order state to refunded
    UPDATE orders 
    SET 
        state = 'refunded',
        refunded_at = NOW(),
        refund_amount_cents = refund_amount_cents,
        refund_reason = refund_reason,
        updated_at = NOW()
    WHERE id = order_id;
    
    -- Create refund payment record
    INSERT INTO payments (
        order_id,
        amount_cents,
        currency,
        payment_method,
        stripe_payment_intent_id,
        stripe_refund_id,
        status,
        processed_at
    ) VALUES (
        order_id,
        refund_amount_cents,
        'aud',
        'stripe_refund',
        order_record.stripe_payment_intent_id,
        'refund_' || order_id, -- This should be the actual Stripe refund ID
        'completed',
        NOW()
    );
    
    -- Create ledger entry for refund
    INSERT INTO ledger_entries (
        order_id,
        user_id,
        amount_cents,
        entry_type,
        description,
        created_at
    ) VALUES (
        order_id,
        user_id,
        -refund_amount_cents, -- Negative amount for refund
        'REFUND',
        'Refund issued for order ' || order_id || ': ' || refund_reason,
        NOW()
    );
    
    -- Return success
    RETURN json_build_object('success', true, 'order_id', order_id, 'refund_amount', refund_amount_cents);
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Function to validate order state transitions
CREATE OR REPLACE FUNCTION validate_order_state_transition(
    order_id UUID,
    new_state TEXT,
    user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    order_record RECORD;
    valid_transitions TEXT[];
BEGIN
    -- Get order details
    SELECT * INTO order_record
    FROM orders 
    WHERE id = order_id;
    
    -- Check if order exists
    IF NOT FOUND THEN
        RETURN json_build_object('valid', false, 'error', 'Order not found');
    END IF;
    
    -- Define valid state transitions
    CASE order_record.state
        WHEN 'pending' THEN
            valid_transitions := ARRAY['pending_payment', 'cancelled'];
        WHEN 'pending_payment' THEN
            valid_transitions := ARRAY['paid', 'payment_failed', 'cancelled'];
        WHEN 'paid' THEN
            valid_transitions := ARRAY['completed', 'refunded', 'disputed'];
        WHEN 'completed' THEN
            valid_transitions := ARRAY['refunded', 'disputed'];
        WHEN 'cancelled' THEN
            valid_transitions := ARRAY[]; -- No transitions from cancelled
        WHEN 'payment_failed' THEN
            valid_transitions := ARRAY['pending_payment', 'cancelled'];
        WHEN 'refunded' THEN
            valid_transitions := ARRAY[]; -- No transitions from refunded
        WHEN 'disputed' THEN
            valid_transitions := ARRAY['completed', 'refunded'];
        ELSE
            valid_transitions := ARRAY[];
    END CASE;
    
    -- Check if transition is valid
    IF new_state = ANY(valid_transitions) THEN
        RETURN json_build_object('valid', true, 'current_state', order_record.state, 'new_state', new_state);
    ELSE
        RETURN json_build_object('valid', false, 'error', 'Invalid state transition', 'current_state', order_record.state, 'new_state', new_state);
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('valid', false, 'error', SQLERRM);
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION confirm_payment_transaction(UUID, TEXT, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION process_refund_transaction(UUID, INTEGER, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_order_state_transition(UUID, TEXT, UUID) TO authenticated;
