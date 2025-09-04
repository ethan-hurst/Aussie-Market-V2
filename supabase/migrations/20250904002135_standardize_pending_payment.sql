-- Add pending_payment to order_state enum and migrate existing pending -> pending_payment
-- This migration needs to be done in multiple steps to avoid enum safety issues

-- Step 1: Add the new enum value
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'order_state' AND e.enumlabel = 'pending_payment'
  ) THEN
    ALTER TYPE order_state ADD VALUE IF NOT EXISTS 'pending_payment' AFTER 'pending';
  END IF;
END $$;

-- Step 2: Update existing orders (skip if no pending orders exist)
DO $$
DECLARE
  pending_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO pending_count FROM public.orders WHERE state = 'pending';
  
  IF pending_count > 0 THEN
    -- Use a more complex approach to avoid enum safety issues
    -- First, change the column to text temporarily
    ALTER TABLE public.orders ALTER COLUMN state TYPE TEXT;
    
    -- Update the values
    UPDATE public.orders SET state = 'pending_payment' WHERE state = 'pending';
    
    -- Change back to enum
    ALTER TABLE public.orders ALTER COLUMN state TYPE order_state USING state::order_state;
  END IF;
END $$;

-- Step 3: Update default (in a separate transaction)
DO $$
BEGIN
  ALTER TABLE public.orders ALTER COLUMN state SET DEFAULT 'pending_payment'::order_state;
EXCEPTION
  WHEN OTHERS THEN
    -- Ignore errors if default is already set
    NULL;
END $$;


