-- Check current cron jobs for auction processing
SELECT jobname, schedule, command, active 
FROM cron.job 
WHERE jobname LIKE '%auction%' OR jobname LIKE '%expired%'
ORDER BY jobname;

-- Check if there are any auctions in various states
SELECT status, COUNT(*) as count
FROM auctions 
GROUP BY status
ORDER BY status;
