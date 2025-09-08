-- Clean up duplicate cron jobs and finalize auction finalization system
-- This completes the auction finalization system with proper cron + idempotency

-- Remove duplicate cron jobs - keep only the most recent one
DO $$
DECLARE
  job_id INT;
BEGIN
  -- Remove the older duplicate job
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'process_expired_auctions_minutely';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END $$;

-- Create a function to manually trigger auction finalization for testing
CREATE OR REPLACE FUNCTION trigger_auction_finalization()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- First run the primary database function
  SELECT end_expired_auctions() INTO result;
  
  -- Return the result
  RETURN json_build_object(
    'success', true,
    'database_function_result', result,
    'message', 'Auction finalization triggered manually'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION trigger_auction_finalization() TO authenticated;

-- Add a comment documenting the complete auction finalization system
COMMENT ON FUNCTION end_expired_auctions() IS 'Primary auction finalization: Processes live auctions past end_at time. Runs every minute via cron.';
COMMENT ON FUNCTION trigger_auction_finalization() IS 'Manual trigger for auction finalization. Useful for testing and manual intervention.';
