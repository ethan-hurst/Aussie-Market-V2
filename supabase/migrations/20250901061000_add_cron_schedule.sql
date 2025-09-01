-- Enable pg_cron and schedule expired auction processing every minute

-- Ensure required extension is available
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Optional: allow querying cron schema
GRANT USAGE ON SCHEMA cron TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA cron TO authenticated;

-- Create or replace a schedule to run end_expired_auctions() every minute
DO $$
DECLARE
	v_jobid INTEGER;
BEGIN
	-- Unschedule existing job if present
	SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'process_expired_auctions_minutely';
	IF v_jobid IS NOT NULL THEN
		PERFORM cron.unschedule(v_jobid);
	END IF;

	-- Schedule to run every minute
	PERFORM cron.schedule(
		'process_expired_auctions_minutely',
		'* * * * *',
		'SELECT public.end_expired_auctions();'
	);
END
$$;


