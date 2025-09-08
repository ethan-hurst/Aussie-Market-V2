-- Check enum types and their values
SELECT t.typname, e.enumlabel
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
WHERE t.typname IN ('kyc_status', 'item_condition', 'order_state', 'user_role')
ORDER BY t.typname, e.enumsortorder;
