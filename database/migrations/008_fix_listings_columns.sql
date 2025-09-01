-- Fix missing columns in listings table
-- This migration adds columns that might be missing from previous partial migrations

-- Add current_bid_cents column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'current_bid_cents'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN current_bid_cents INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add bid_count column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'bid_count'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN bid_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add view_count column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'view_count'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN view_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add updated_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
END $$;

-- Add location column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'location'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN location JSONB NOT NULL DEFAULT '{}';
    END IF;
END $$;

-- Add pickup column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'pickup'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN pickup BOOLEAN NOT NULL DEFAULT true;
    END IF;
END $$;

-- Add shipping column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'shipping'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN shipping BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- Add reserve_cents column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'reserve_cents'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN reserve_cents INTEGER CHECK (reserve_cents >= 0);
    END IF;
END $$;

-- Add buy_now_cents column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'buy_now_cents'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN buy_now_cents INTEGER CHECK (buy_now_cents >= 0);
    END IF;
END $$;

-- Add start_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'start_at'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN start_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
END $$;

-- Add end_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'end_at'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN end_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days';
    END IF;
END $$;

-- Add status column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'status'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'ended', 'sold', 'cancelled'));
    END IF;
END $$;

-- Add condition column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'condition'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN condition TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('new', 'like_new', 'good', 'fair', 'parts'));
    END IF;
END $$;

-- Add category_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'category_id'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN category_id INTEGER NOT NULL DEFAULT 1;
    END IF;
END $$;

-- Add description column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'description'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN description TEXT NOT NULL DEFAULT '';
    END IF;
END $$;

-- Add title column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'title'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN title TEXT NOT NULL DEFAULT '';
    END IF;
END $$;

-- Add seller_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'seller_id'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN seller_id UUID NOT NULL;
    END IF;
END $$;

-- Add start_cents column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'start_cents'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN start_cents INTEGER NOT NULL DEFAULT 100 CHECK (start_cents >= 100);
    END IF;
END $$;

-- Add created_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
END $$;

-- Add id column if it doesn't exist (primary key)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'listings'
        AND column_name = 'id'
    ) THEN
        ALTER TABLE public.listings ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid();
    END IF;
END $$;

-- Ensure the table exists
CREATE TABLE IF NOT EXISTS public.listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    condition TEXT NOT NULL CHECK (condition IN ('new', 'like_new', 'good', 'fair', 'parts')),
    start_cents INTEGER NOT NULL CHECK (start_cents >= 100),
    reserve_cents INTEGER CHECK (reserve_cents >= 0),
    buy_now_cents INTEGER CHECK (buy_now_cents >= 0),
    current_bid_cents INTEGER DEFAULT 0,
    pickup BOOLEAN NOT NULL DEFAULT true,
    shipping BOOLEAN NOT NULL DEFAULT false,
    location JSONB NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'ended', 'sold', 'cancelled')),
    view_count INTEGER DEFAULT 0,
    bid_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'listings_seller_id_fkey'
        AND table_name = 'listings'
    ) THEN
        ALTER TABLE public.listings ADD CONSTRAINT listings_seller_id_fkey 
        FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
END $$;
