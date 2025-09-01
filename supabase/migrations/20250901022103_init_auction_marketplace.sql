-- C2C Auction Marketplace Database Schema
-- Fresh database setup for auction marketplace

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- USERS & ROLES
CREATE TYPE user_role AS ENUM ('buyer', 'seller', 'moderator', 'admin');
CREATE TYPE kyc_status AS ENUM ('none', 'pending', 'passed', 'failed');

CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT auth.uid(),
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  legal_name TEXT,
  dob DATE,
  address JSONB,
  role user_role NOT NULL DEFAULT 'buyer',
  kyc kyc_status NOT NULL DEFAULT 'none',
  stripe_customer_id TEXT,
  stripe_connect_account_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users RLS policies
CREATE POLICY "users_self_select" ON public.users FOR SELECT USING (id = auth.uid());
CREATE POLICY "users_self_update" ON public.users FOR UPDATE USING (id = auth.uid());
CREATE POLICY "users_self_insert" ON public.users FOR INSERT WITH CHECK (id = auth.uid());

-- LISTINGS
CREATE TYPE item_condition AS ENUM ('new', 'like_new', 'good', 'fair', 'parts');

CREATE TABLE public.listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) <= 140),
  description TEXT NOT NULL CHECK (char_length(description) <= 4096),
  category_id INTEGER NOT NULL,
  condition item_condition NOT NULL,
  location JSONB NOT NULL,       -- {suburb, postcode, state}
  pickup BOOLEAN NOT NULL DEFAULT true,
  shipping BOOLEAN NOT NULL DEFAULT false,
  reserve_cents INTEGER,         -- nullable = no reserve
  buy_now_cents INTEGER,
  start_cents INTEGER NOT NULL,
  start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled|live|ended|cancelled
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.listing_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  phash TEXT,                    -- perceptual hash for dup detection
  order_idx INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on listings tables
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_photos ENABLE ROW LEVEL SECURITY;

-- Listings RLS policies
CREATE POLICY "seller_rw" ON public.listings FOR ALL
  USING (seller_id = auth.uid()) WITH CHECK (seller_id = auth.uid());
CREATE POLICY "public_read_live" ON public.listings FOR SELECT
  USING (status IN ('live', 'scheduled'));

CREATE POLICY "listing_photos_public_read" ON public.listing_photos FOR SELECT
  USING (listing_id IN (SELECT id FROM public.listings WHERE status IN ('live', 'scheduled')));
CREATE POLICY "listing_photos_seller_rw" ON public.listing_photos FOR ALL
  USING (listing_id IN (SELECT id FROM public.listings WHERE seller_id = auth.uid()));

-- AUCTIONS & BIDS
CREATE TABLE public.auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID UNIQUE NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  reserve_met BOOLEAN NOT NULL DEFAULT false,
  extension_count INTEGER NOT NULL DEFAULT 0,
  increment_scheme TEXT NOT NULL DEFAULT 'default',
  high_bid_id UUID,
  current_price_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled'   -- scheduled|live|ending|ended
);

CREATE TABLE public.bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  bidder_id UUID NOT NULL REFERENCES public.users(id),
  amount_cents INTEGER NOT NULL,
  max_proxy_cents INTEGER,
  accepted BOOLEAN NOT NULL DEFAULT false,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON public.bids (auction_id, placed_at);

-- Enable RLS on auctions and bids tables
ALTER TABLE public.auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;

-- Auctions RLS policies
CREATE POLICY "auctions_public_read" ON public.auctions FOR SELECT
  USING (listing_id IN (SELECT id FROM public.listings WHERE status IN ('live', 'scheduled')));

-- Bids RLS policies
CREATE POLICY "bidder_own_read" ON public.bids FOR SELECT USING (bidder_id = auth.uid());
CREATE POLICY "bidder_create" ON public.bids FOR INSERT WITH CHECK (bidder_id = auth.uid());

-- ORDERS & LEDGER
CREATE TYPE order_state AS ENUM ('pending', 'paid', 'ready_for_handover', 'shipped', 'delivered', 'released', 'refunded', 'cancelled');

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id),
  buyer_id UUID NOT NULL REFERENCES public.users(id),
  seller_id UUID NOT NULL REFERENCES public.users(id),
  amount_cents INTEGER NOT NULL,
  protection_eligible BOOLEAN NOT NULL DEFAULT true,
  state order_state NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,             -- stripe|paypal
  provider_ref TEXT,
  status TEXT NOT NULL,               -- authorized|captured|refunded|failed
  amount_cents INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Double-entry ledger (debits/credits balance to zero per order)
CREATE TYPE ledger_type AS ENUM ('AUTH', 'CAPTURE', 'HOLD', 'RELEASE', 'FEE', 'PAYOUT', 'REFUND', 'ADJUST');
CREATE TABLE public.ledger_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id),
  entry_type ledger_type NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AUD',
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on orders, payments, and ledger tables
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

-- Orders RLS policies
CREATE POLICY "orders_party_read" ON public.orders FOR SELECT
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- Payments RLS policies
CREATE POLICY "payments_party_read" ON public.payments FOR SELECT
  USING (order_id IN (SELECT id FROM public.orders WHERE buyer_id = auth.uid() OR seller_id = auth.uid()));

-- Ledger entries RLS policies (admin only for security)
CREATE POLICY "ledger_admin_only" ON public.ledger_entries FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

-- PICKUP & SHIPPING
CREATE TABLE public.pickups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID UNIQUE NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  code6_hash TEXT NOT NULL,
  qr_token TEXT NOT NULL,
  redeemed_by UUID,
  redeemed_at TIMESTAMPTZ,
  location JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID UNIQUE NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  carrier TEXT,
  tracking TEXT,
  label_url TEXT,
  first_scan_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on pickup and shipment tables
ALTER TABLE public.pickups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

-- Pickup and shipment RLS policies
CREATE POLICY "pickup_party_read" ON public.pickups FOR SELECT
  USING (order_id IN (SELECT id FROM public.orders WHERE buyer_id = auth.uid() OR seller_id = auth.uid()));

CREATE POLICY "shipment_party_read" ON public.shipments FOR SELECT
  USING (order_id IN (SELECT id FROM public.orders WHERE buyer_id = auth.uid() OR seller_id = auth.uid()));

-- DISPUTES
CREATE TYPE dispute_reason AS ENUM ('not_received', 'not_as_described', 'faulty');
CREATE TYPE dispute_state AS ENUM ('open', 'needs_evidence', 'review', 'resolved');

CREATE TABLE public.disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id),
  reason dispute_reason NOT NULL,
  state dispute_state NOT NULL DEFAULT 'open',
  decision TEXT,           -- refund|partial|deny
  refund_cents INTEGER,
  evidence_urls JSONB,     -- Array of evidence file URLs
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on disputes table
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

-- Disputes RLS policies
CREATE POLICY "disputes_party_read" ON public.disputes FOR SELECT
  USING (order_id IN (SELECT id FROM public.orders WHERE buyer_id = auth.uid() OR seller_id = auth.uid()));
CREATE POLICY "disputes_buyer_create" ON public.disputes FOR INSERT
  WITH CHECK (order_id IN (SELECT id FROM public.orders WHERE buyer_id = auth.uid()));

-- MESSAGING
CREATE TABLE public.message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES public.listings(id),
  order_id UUID REFERENCES public.orders(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id),
  content TEXT NOT NULL CHECK (char_length(content) <= 1000),
  sanitized_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on messaging tables
ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Messaging RLS policies
CREATE POLICY "threads_party_read" ON public.message_threads FOR SELECT
  USING (
    listing_id IN (SELECT id FROM public.listings WHERE seller_id = auth.uid()) OR
    order_id IN (SELECT id FROM public.orders WHERE buyer_id = auth.uid() OR seller_id = auth.uid())
  );

CREATE POLICY "messages_party_read" ON public.messages FOR SELECT
  USING (thread_id IN (SELECT id FROM public.message_threads WHERE 
    listing_id IN (SELECT id FROM public.listings WHERE seller_id = auth.uid()) OR
    order_id IN (SELECT id FROM public.orders WHERE buyer_id = auth.uid() OR seller_id = auth.uid())
  ));
CREATE POLICY "messages_sender_create" ON public.messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- AUDIT LOGS
CREATE TABLE public.audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES public.users(id),
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on audit logs (admin only)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_admin_only" ON public.audit_logs FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

-- METRICS
CREATE TABLE public.metrics (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  metric_date DATE NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on metrics (admin only)
ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "metrics_admin_only" ON public.metrics FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

-- Create indexes for performance
CREATE INDEX ON public.listings (seller_id, status);
CREATE INDEX ON public.listings (category_id, status);
CREATE INDEX ON public.listings (end_at) WHERE status = 'live';
CREATE INDEX ON public.auctions (status);
CREATE INDEX ON public.orders (buyer_id, state);
CREATE INDEX ON public.orders (seller_id, state);
CREATE INDEX ON public.orders (created_at);
CREATE INDEX ON public.ledger_entries (order_id, entry_type);
CREATE INDEX ON public.disputes (state);
CREATE INDEX ON public.messages (thread_id, created_at);
CREATE INDEX ON public.audit_logs (user_id, created_at);
CREATE INDEX ON public.metrics (metric_name, metric_date);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_listings_updated_at BEFORE UPDATE ON public.listings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_disputes_updated_at BEFORE UPDATE ON public.disputes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
