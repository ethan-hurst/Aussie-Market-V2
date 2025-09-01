-- Check message_threads table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'message_threads' 
ORDER BY ordinal_position;

-- Check messages table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'messages' 
ORDER BY ordinal_position;
