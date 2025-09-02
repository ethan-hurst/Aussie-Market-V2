-- Update orders, payments, and ledger_entries to support Stripe integration

-- Orders: add auction/payment metadata
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER,
  ADD COLUMN IF NOT EXISTS seller_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS auction_id UUID REFERENCES public.auctions(id),
  ADD COLUMN IF NOT EXISTS winning_bid_id UUID REFERENCES public.bids(id),
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_auction_id ON public.orders(auction_id);
CREATE INDEX IF NOT EXISTS idx_orders_winning_bid_id ON public.orders(winning_bid_id);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_intent ON public.orders(stripe_payment_intent_id);

-- Payments: add Stripe-specific fields
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_intent ON public.payments(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_refund ON public.payments(stripe_refund_id);

-- Ledger entries: capture actor and description
ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS description TEXT;


