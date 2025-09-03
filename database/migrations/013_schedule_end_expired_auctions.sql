-- Enable pg_cron and schedule periodic auction finalization

-- Enable extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Optional: ensure job runs in current database
-- This setting is only required in some environments
-- SELECT set_config('cron.database_name', current_database(), false);

-- Unschedule existing job with the same name (if exists)
DO $$
DECLARE
  existing_job_id INT;
BEGIN
  SELECT jobid INTO existing_job_id FROM cron.job WHERE jobname = 'end_expired_auctions_every_minute';
  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
END $$;

-- Schedule end_expired_auctions to run every minute
SELECT cron.schedule(
  'end_expired_auctions_every_minute',
  '* * * * *',
  $$SELECT public.end_expired_auctions();$$
);


