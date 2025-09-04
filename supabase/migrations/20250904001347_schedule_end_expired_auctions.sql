-- Schedule periodic auction finalization (pg_cron must be enabled by the platform)
DO $$
DECLARE
  existing_job_id INT;
BEGIN
  SELECT jobid INTO existing_job_id FROM cron.job WHERE jobname = 'end_expired_auctions_every_minute';
  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'end_expired_auctions_every_minute',
  '* * * * *',
  $$SELECT public.end_expired_auctions();$$
);


