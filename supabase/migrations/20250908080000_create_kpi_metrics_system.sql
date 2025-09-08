-- KPI Metrics Collection and Business Intelligence System
-- Migration: 20250908080000_create_kpi_metrics_system.sql
-- Purpose: Create comprehensive KPI metrics collection for business intelligence
-- Dependencies: Requires existing tables (orders, payments, listings, auctions, bids, users)

-- Create KPI metrics categories enum
DO $$ BEGIN
    CREATE TYPE kpi_metric_category AS ENUM (
        'financial',      -- GMV, revenue, AOV, payment success rates
        'business',       -- attach rate, dispute rate, engagement
        'performance',    -- bid latency, API performance, response times
        'operational'     -- uptime, error rates, resource utilization
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create KPI metrics table for aggregated business metrics
CREATE TABLE IF NOT EXISTS public.kpi_metrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category kpi_metric_category NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value NUMERIC NOT NULL,
    metric_unit TEXT,
    time_period TEXT NOT NULL, -- 'hourly', 'daily', 'weekly', 'monthly'
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    tags JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    calculated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_category_name ON public.kpi_metrics(category, metric_name);
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_time_period ON public.kpi_metrics(time_period, period_start);
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_period_range ON public.kpi_metrics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_tags ON public.kpi_metrics USING GIN(tags);

-- Create real-time KPI events table for immediate metrics collection
CREATE TABLE IF NOT EXISTS public.kpi_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type TEXT NOT NULL, -- 'order_created', 'payment_success', 'bid_placed', etc.
    category kpi_metric_category NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value NUMERIC NOT NULL,
    metric_unit TEXT,
    user_id UUID REFERENCES public.users(id),
    order_id UUID REFERENCES public.orders(id),
    listing_id UUID REFERENCES public.listings(id),
    auction_id UUID REFERENCES public.auctions(id),
    tags JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    recorded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for real-time events
CREATE INDEX IF NOT EXISTS idx_kpi_events_type_category ON public.kpi_events(event_type, category);
CREATE INDEX IF NOT EXISTS idx_kpi_events_recorded_at ON public.kpi_events(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_events_user_id ON public.kpi_events(user_id);
CREATE INDEX IF NOT EXISTS idx_kpi_events_order_id ON public.kpi_events(order_id);
CREATE INDEX IF NOT EXISTS idx_kpi_events_listing_id ON public.kpi_events(listing_id);
CREATE INDEX IF NOT EXISTS idx_kpi_events_auction_id ON public.kpi_events(auction_id);

-- Create KPI dashboard views for real-time metrics
CREATE OR REPLACE VIEW public.kpi_dashboard_financial AS
SELECT 
    metric_name,
    metric_value,
    metric_unit,
    time_period,
    period_start,
    period_end,
    tags,
    calculated_at
FROM public.kpi_metrics 
WHERE category = 'financial'
    AND period_end >= NOW() - INTERVAL '7 days'
ORDER BY period_start DESC;

CREATE OR REPLACE VIEW public.kpi_dashboard_business AS
SELECT 
    metric_name,
    metric_value,
    metric_unit,
    time_period,
    period_start,
    period_end,
    tags,
    calculated_at
FROM public.kpi_metrics 
WHERE category = 'business'
    AND period_end >= NOW() - INTERVAL '7 days'
ORDER BY period_start DESC;

CREATE OR REPLACE VIEW public.kpi_dashboard_performance AS
SELECT 
    metric_name,
    metric_value,
    metric_unit,
    time_period,
    period_start,
    period_end,
    tags,
    calculated_at
FROM public.kpi_metrics 
WHERE category = 'performance'
    AND period_end >= NOW() - INTERVAL '7 days'
ORDER BY period_start DESC;

CREATE OR REPLACE VIEW public.kpi_dashboard_operational AS
SELECT 
    metric_name,
    metric_value,
    metric_unit,
    time_period,
    period_start,
    period_end,
    tags,
    calculated_at
FROM public.kpi_metrics 
WHERE category = 'operational'
    AND period_end >= NOW() - INTERVAL '7 days'
ORDER BY period_start DESC;

-- Create function to calculate financial KPIs
CREATE OR REPLACE FUNCTION calculate_financial_kpis(
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    time_period TEXT
)
RETURNS INTEGER AS $$
DECLARE
    metrics_calculated INTEGER := 0;
    gmv_cents BIGINT;
    total_orders INTEGER;
    avg_order_value_cents NUMERIC;
    payment_success_rate NUMERIC;
    total_payments INTEGER;
    successful_payments INTEGER;
    refund_rate NUMERIC;
    total_refunds INTEGER;
    platform_revenue_cents BIGINT;
BEGIN
    -- Calculate GMV (Gross Merchandise Value)
    SELECT COALESCE(SUM(amount_cents), 0) INTO gmv_cents
    FROM public.orders 
    WHERE created_at >= start_time AND created_at < end_time
        AND state IN ('paid', 'ready_for_handover', 'shipped', 'delivered', 'released');
    
    INSERT INTO public.kpi_metrics (
        category, metric_name, metric_value, metric_unit, time_period, period_start, period_end
    ) VALUES (
        'financial', 'gmv_cents', gmv_cents, 'cents', time_period, start_time, end_time
    );
    metrics_calculated := metrics_calculated + 1;

    -- Calculate total orders
    SELECT COUNT(*) INTO total_orders
    FROM public.orders 
    WHERE created_at >= start_time AND created_at < end_time;
    
    INSERT INTO public.kpi_metrics (
        category, metric_name, metric_value, metric_unit, time_period, period_start, period_end
    ) VALUES (
        'financial', 'total_orders', total_orders, 'count', time_period, start_time, end_time
    );
    metrics_calculated := metrics_calculated + 1;

    -- Calculate Average Order Value (AOV)
    IF total_orders > 0 THEN
        avg_order_value_cents := gmv_cents / total_orders;
    ELSE
        avg_order_value_cents := 0;
    END IF;
    
    INSERT INTO public.kpi_metrics (
        category, metric_name, metric_value, metric_unit, time_period, period_start, period_end
    ) VALUES (
        'financial', 'avg_order_value_cents', avg_order_value_cents, 'cents', time_period, start_time, end_time
    );
    metrics_calculated := metrics_calculated + 1;

    -- Calculate payment success rate
    SELECT COUNT(*) INTO total_payments
    FROM public.payments 
    WHERE created_at >= start_time AND created_at < end_time;
    
    SELECT COUNT(*) INTO successful_payments
    FROM public.payments 
    WHERE created_at >= start_time AND created_at < end_time
        AND status = 'captured';
    
    IF total_payments > 0 THEN
        payment_success_rate := (successful_payments::NUMERIC / total_payments::NUMERIC) * 100;
    ELSE
        payment_success_rate := 0;
    END IF;
    
    INSERT INTO public.kpi_metrics (
        category, metric_name, metric_value, metric_unit, time_period, period_start, period_end
    ) VALUES (
        'financial', 'payment_success_rate', payment_success_rate, 'percentage', time_period, start_time, end_time
    );
    metrics_calculated := metrics_calculated + 1;

    -- Calculate refund rate
    SELECT COUNT(*) INTO total_refunds
    FROM public.payments 
    WHERE created_at >= start_time AND created_at < end_time
        AND status = 'refunded';
    
    IF total_payments > 0 THEN
        refund_rate := (total_refunds::NUMERIC / total_payments::NUMERIC) * 100;
    ELSE
        refund_rate := 0;
    END IF;
    
    INSERT INTO public.kpi_metrics (
        category, metric_name, metric_value, metric_unit, time_period, period_start, period_end
    ) VALUES (
        'financial', 'refund_rate', refund_rate, 'percentage', time_period, start_time, end_time
    );
    metrics_calculated := metrics_calculated + 1;

    -- Calculate platform revenue (from ledger entries)
    SELECT COALESCE(SUM(amount_cents), 0) INTO platform_revenue_cents
    FROM public.ledger_entries 
    WHERE created_at >= start_time AND created_at < end_time
        AND entry_type = 'FEE';
    
    INSERT INTO public.kpi_metrics (
        category, metric_name, metric_value, metric_unit, time_period, period_start, period_end
    ) VALUES (
        'financial', 'platform_revenue_cents', platform_revenue_cents, 'cents', time_period, start_time, end_time
    );
    metrics_calculated := metrics_calculated + 1;

    RETURN metrics_calculated;
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate business KPIs
CREATE OR REPLACE FUNCTION calculate_business_kpis(
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    time_period TEXT
)
RETURNS INTEGER AS $$
DECLARE
    metrics_calculated INTEGER := 0;
    total_listings INTEGER;
    listings_with_orders INTEGER;
    attach_rate NUMERIC;
    total_auctions INTEGER;
    auctions_with_bids INTEGER;
    bid_participation_rate NUMERIC;
    total_bids INTEGER;
    avg_bids_per_auction NUMERIC;
    total_users INTEGER;
    active_users INTEGER;
    user_engagement_rate NUMERIC;
BEGIN
    -- Calculate auction attach rate (listings that result in orders)
    SELECT COUNT(*) INTO total_listings
    FROM public.listings 
    WHERE created_at >= start_time AND created_at < end_time;
    
    SELECT COUNT(DISTINCT listing_id) INTO listings_with_orders
    FROM public.orders 
    WHERE created_at >= start_time AND created_at < end_time;
    
    IF total_listings > 0 THEN
        attach_rate := (listings_with_orders::NUMERIC / total_listings::NUMERIC) * 100;
    ELSE
        attach_rate := 0;
    END IF;
    
    INSERT INTO public.kpi_metrics (
        category, metric_name, metric_value, metric_unit, time_period, period_start, period_end
    ) VALUES (
        'business', 'auction_attach_rate', attach_rate, 'percentage', time_period, start_time, end_time
    );
    metrics_calculated := metrics_calculated + 1;

    -- Calculate bid participation rate
    SELECT COUNT(*) INTO total_auctions
    FROM public.auctions 
    WHERE created_at >= start_time AND created_at < end_time;
    
    SELECT COUNT(DISTINCT auction_id) INTO auctions_with_bids
    FROM public.bids 
    WHERE placed_at >= start_time AND placed_at < end_time;
    
    IF total_auctions > 0 THEN
        bid_participation_rate := (auctions_with_bids::NUMERIC / total_auctions::NUMERIC) * 100;
    ELSE
        bid_participation_rate := 0;
    END IF;
    
    INSERT INTO public.kpi_metrics (
        category, metric_name, metric_value, metric_unit, time_period, period_start, period_end
    ) VALUES (
        'business', 'bid_participation_rate', bid_participation_rate, 'percentage', time_period, start_time, end_time
    );
    metrics_calculated := metrics_calculated + 1;

    -- Calculate average bids per auction
    SELECT COUNT(*) INTO total_bids
    FROM public.bids 
    WHERE placed_at >= start_time AND placed_at < end_time;
    
    IF auctions_with_bids > 0 THEN
        avg_bids_per_auction := total_bids::NUMERIC / auctions_with_bids::NUMERIC;
    ELSE
        avg_bids_per_auction := 0;
    END IF;
    
    INSERT INTO public.kpi_metrics (
        category, metric_name, metric_value, metric_unit, time_period, period_start, period_end
    ) VALUES (
        'business', 'avg_bids_per_auction', avg_bids_per_auction, 'count', time_period, start_time, end_time
    );
    metrics_calculated := metrics_calculated + 1;

    -- Calculate user engagement rate
    SELECT COUNT(*) INTO total_users
    FROM public.users 
    WHERE created_at >= start_time AND created_at < end_time;
    
    SELECT COUNT(DISTINCT user_id) INTO active_users
    FROM (
        SELECT buyer_id as user_id FROM public.orders WHERE created_at >= start_time AND created_at < end_time
        UNION
        SELECT seller_id as user_id FROM public.orders WHERE created_at >= start_time AND created_at < end_time
        UNION
        SELECT bidder_id as user_id FROM public.bids WHERE placed_at >= start_time AND placed_at < end_time
    ) active_user_activities;
    
    IF total_users > 0 THEN
        user_engagement_rate := (active_users::NUMERIC / total_users::NUMERIC) * 100;
    ELSE
        user_engagement_rate := 0;
    END IF;
    
    INSERT INTO public.kpi_metrics (
        category, metric_name, metric_value, metric_unit, time_period, period_start, period_end
    ) VALUES (
        'business', 'user_engagement_rate', user_engagement_rate, 'percentage', time_period, start_time, end_time
    );
    metrics_calculated := metrics_calculated + 1;

    RETURN metrics_calculated;
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate performance KPIs
CREATE OR REPLACE FUNCTION calculate_performance_kpis(
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    time_period TEXT
)
RETURNS INTEGER AS $$
DECLARE
    metrics_calculated INTEGER := 0;
    avg_bid_latency_ms NUMERIC;
    total_bids INTEGER;
    api_response_time_ms NUMERIC;
    error_rate NUMERIC;
    total_requests INTEGER;
    error_requests INTEGER;
BEGIN
    -- Calculate average bid latency (from structured_metrics)
    SELECT AVG(value) INTO avg_bid_latency_ms
    FROM public.structured_metrics 
    WHERE metric_name = 'bid_latency_ms'
        AND recorded_at >= start_time AND recorded_at < end_time;
    
    IF avg_bid_latency_ms IS NULL THEN
        avg_bid_latency_ms := 0;
    END IF;
    
    INSERT INTO public.kpi_metrics (
        category, metric_name, metric_value, metric_unit, time_period, period_start, period_end
    ) VALUES (
        'performance', 'avg_bid_latency_ms', avg_bid_latency_ms, 'milliseconds', time_period, start_time, end_time
    );
    metrics_calculated := metrics_calculated + 1;

    -- Calculate API response time (from structured_metrics)
    SELECT AVG(value) INTO api_response_time_ms
    FROM public.structured_metrics 
    WHERE metric_name = 'api_response_time_ms'
        AND recorded_at >= start_time AND recorded_at < end_time;
    
    IF api_response_time_ms IS NULL THEN
        api_response_time_ms := 0;
    END IF;
    
    INSERT INTO public.kpi_metrics (
        category, metric_name, metric_value, metric_unit, time_period, period_start, period_end
    ) VALUES (
        'performance', 'avg_api_response_time_ms', api_response_time_ms, 'milliseconds', time_period, start_time, end_time
    );
    metrics_calculated := metrics_calculated + 1;

    -- Calculate error rate (from structured_metrics)
    SELECT COUNT(*) INTO total_requests
    FROM public.structured_metrics 
    WHERE metric_name = 'api_request_count'
        AND recorded_at >= start_time AND recorded_at < end_time;
    
    SELECT COUNT(*) INTO error_requests
    FROM public.structured_metrics 
    WHERE metric_name = 'api_error_count'
        AND recorded_at >= start_time AND recorded_at < end_time;
    
    IF total_requests > 0 THEN
        error_rate := (error_requests::NUMERIC / total_requests::NUMERIC) * 100;
    ELSE
        error_rate := 0;
    END IF;
    
    INSERT INTO public.kpi_metrics (
        category, metric_name, metric_value, metric_unit, time_period, period_start, period_end
    ) VALUES (
        'performance', 'api_error_rate', error_rate, 'percentage', time_period, start_time, end_time
    );
    metrics_calculated := metrics_calculated + 1;

    RETURN metrics_calculated;
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate operational KPIs
CREATE OR REPLACE FUNCTION calculate_operational_kpis(
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    time_period TEXT
)
RETURNS INTEGER AS $$
DECLARE
    metrics_calculated INTEGER := 0;
    system_uptime_percentage NUMERIC;
    total_errors INTEGER;
    total_operations INTEGER;
    error_rate NUMERIC;
    avg_memory_usage_mb NUMERIC;
    avg_cpu_usage_percentage NUMERIC;
BEGIN
    -- Calculate system uptime (simplified - based on error rate)
    SELECT COUNT(*) INTO total_errors
    FROM public.structured_metrics 
    WHERE metric_name = 'system_error_count'
        AND recorded_at >= start_time AND recorded_at < end_time;
    
    SELECT COUNT(*) INTO total_operations
    FROM public.structured_metrics 
    WHERE metric_name = 'system_operation_count'
        AND recorded_at >= start_time AND recorded_at < end_time;
    
    IF total_operations > 0 THEN
        error_rate := (total_errors::NUMERIC / total_operations::NUMERIC) * 100;
        system_uptime_percentage := 100 - error_rate;
    ELSE
        system_uptime_percentage := 100;
    END IF;
    
    INSERT INTO public.kpi_metrics (
        category, metric_name, metric_value, metric_unit, time_period, period_start, period_end
    ) VALUES (
        'operational', 'system_uptime_percentage', system_uptime_percentage, 'percentage', time_period, start_time, end_time
    );
    metrics_calculated := metrics_calculated + 1;

    -- Calculate average memory usage
    SELECT AVG(value) INTO avg_memory_usage_mb
    FROM public.structured_metrics 
    WHERE metric_name = 'memory_usage_mb'
        AND recorded_at >= start_time AND recorded_at < end_time;
    
    IF avg_memory_usage_mb IS NULL THEN
        avg_memory_usage_mb := 0;
    END IF;
    
    INSERT INTO public.kpi_metrics (
        category, metric_name, metric_value, metric_unit, time_period, period_start, period_end
    ) VALUES (
        'operational', 'avg_memory_usage_mb', avg_memory_usage_mb, 'megabytes', time_period, start_time, end_time
    );
    metrics_calculated := metrics_calculated + 1;

    -- Calculate average CPU usage
    SELECT AVG(value) INTO avg_cpu_usage_percentage
    FROM public.structured_metrics 
    WHERE metric_name = 'cpu_usage_percentage'
        AND recorded_at >= start_time AND recorded_at < end_time;
    
    IF avg_cpu_usage_percentage IS NULL THEN
        avg_cpu_usage_percentage := 0;
    END IF;
    
    INSERT INTO public.kpi_metrics (
        category, metric_name, metric_value, metric_unit, time_period, period_start, period_end
    ) VALUES (
        'operational', 'avg_cpu_usage_percentage', avg_cpu_usage_percentage, 'percentage', time_period, start_time, end_time
    );
    metrics_calculated := metrics_calculated + 1;

    RETURN metrics_calculated;
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate all KPIs for a time period
CREATE OR REPLACE FUNCTION calculate_all_kpis(
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    time_period TEXT
)
RETURNS INTEGER AS $$
DECLARE
    total_metrics INTEGER := 0;
BEGIN
    -- Calculate all KPI categories
    SELECT calculate_financial_kpis(start_time, end_time, time_period) INTO total_metrics;
    total_metrics := total_metrics + calculate_business_kpis(start_time, end_time, time_period);
    total_metrics := total_metrics + calculate_performance_kpis(start_time, end_time, time_period);
    total_metrics := total_metrics + calculate_operational_kpis(start_time, end_time, time_period);
    
    RETURN total_metrics;
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up old KPI metrics (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_kpi_metrics()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.kpi_metrics 
    WHERE period_end < NOW() - INTERVAL '90 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up old KPI events (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_kpi_events()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.kpi_events 
    WHERE recorded_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create scheduled jobs for KPI calculation and cleanup
SELECT cron.schedule(
    'calculate-hourly-kpis',
    '0 * * * *', -- Run every hour
    'SELECT calculate_all_kpis(NOW() - INTERVAL ''1 hour'', NOW(), ''hourly'');'
);

SELECT cron.schedule(
    'calculate-daily-kpis',
    '0 1 * * *', -- Run at 1 AM daily
    'SELECT calculate_all_kpis(NOW() - INTERVAL ''1 day'', NOW(), ''daily'');'
);

SELECT cron.schedule(
    'calculate-weekly-kpis',
    '0 2 * * 1', -- Run at 2 AM on Mondays
    'SELECT calculate_all_kpis(NOW() - INTERVAL ''1 week'', NOW(), ''weekly'');'
);

SELECT cron.schedule(
    'calculate-monthly-kpis',
    '0 3 1 * *', -- Run at 3 AM on the 1st of each month
    'SELECT calculate_all_kpis(NOW() - INTERVAL ''1 month'', NOW(), ''monthly'');'
);

SELECT cron.schedule(
    'cleanup-old-kpi-metrics',
    '0 4 * * *', -- Run at 4 AM daily
    'SELECT cleanup_old_kpi_metrics();'
);

SELECT cron.schedule(
    'cleanup-old-kpi-events',
    '0 5 * * *', -- Run at 5 AM daily
    'SELECT cleanup_old_kpi_events();'
);

-- Enable RLS on KPI tables
ALTER TABLE public.kpi_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_events ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (admin only access for KPI metrics)
CREATE POLICY "kpi_metrics_admin_only" ON public.kpi_metrics
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "kpi_events_admin_only" ON public.kpi_events
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Grant permissions
GRANT SELECT ON public.kpi_metrics TO authenticated;
GRANT SELECT ON public.kpi_events TO authenticated;
GRANT SELECT ON public.kpi_dashboard_financial TO authenticated;
GRANT SELECT ON public.kpi_dashboard_business TO authenticated;
GRANT SELECT ON public.kpi_dashboard_performance TO authenticated;
GRANT SELECT ON public.kpi_dashboard_operational TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE public.kpi_metrics IS 'Aggregated KPI metrics for business intelligence and reporting';
COMMENT ON TABLE public.kpi_events IS 'Real-time KPI events for immediate metrics collection';
COMMENT ON TYPE kpi_metric_category IS 'Categories of KPI metrics: financial, business, performance, operational';
