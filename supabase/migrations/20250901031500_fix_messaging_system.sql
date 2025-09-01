-- Add missing columns to message_threads if they don't exist
DO $$ 
BEGIN
    -- Add buyer_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'message_threads' AND column_name = 'buyer_id') THEN
        ALTER TABLE message_threads ADD COLUMN buyer_id UUID REFERENCES users(id) ON DELETE CASCADE;
    END IF;
    
    -- Add seller_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'message_threads' AND column_name = 'seller_id') THEN
        ALTER TABLE message_threads ADD COLUMN seller_id UUID REFERENCES users(id) ON DELETE CASCADE;
    END IF;
    
    -- Add subject column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'message_threads' AND column_name = 'subject') THEN
        ALTER TABLE message_threads ADD COLUMN subject TEXT;
    END IF;
    
    -- Add last_message_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'message_threads' AND column_name = 'last_message_at') THEN
        ALTER TABLE message_threads ADD COLUMN last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- Add missing columns to messages if they don't exist
DO $$ 
BEGIN
    -- Add message_type column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'message_type') THEN
        ALTER TABLE messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text';
        ALTER TABLE messages ADD CONSTRAINT check_message_type CHECK (message_type IN ('text', 'image', 'file', 'system'));
    END IF;
    
    -- Add attachment_url column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'attachment_url') THEN
        ALTER TABLE messages ADD COLUMN attachment_url TEXT;
    END IF;
    
    -- Add attachment_name column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'attachment_name') THEN
        ALTER TABLE messages ADD COLUMN attachment_name TEXT;
    END IF;
    
    -- Add attachment_size column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'attachment_size') THEN
        ALTER TABLE messages ADD COLUMN attachment_size INTEGER;
    END IF;
    
    -- Add read_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'read_at') THEN
        ALTER TABLE messages ADD COLUMN read_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_message_threads_order_id ON message_threads(order_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_buyer_id ON message_threads(buyer_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_seller_id ON message_threads(seller_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_last_message_at ON message_threads(last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_read_at ON messages(read_at);

-- Enable RLS if not already enabled
ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view threads they participate in" ON message_threads;
DROP POLICY IF EXISTS "Users can create threads" ON message_threads;
DROP POLICY IF EXISTS "Users can update threads they participate in" ON message_threads;

DROP POLICY IF EXISTS "Users can view messages in their threads" ON messages;
DROP POLICY IF EXISTS "Users can send messages in their threads" ON messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON messages;

-- Create RLS Policies for message_threads
CREATE POLICY "Users can view threads they participate in" ON message_threads
    FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

CREATE POLICY "Users can create threads" ON message_threads
    FOR INSERT WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id);

CREATE POLICY "Users can update threads they participate in" ON message_threads
    FOR UPDATE USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- Create RLS Policies for messages
CREATE POLICY "Users can view messages in their threads" ON messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM message_threads 
            WHERE id = messages.thread_id 
            AND (buyer_id = auth.uid() OR seller_id = auth.uid())
        )
    );

CREATE POLICY "Users can send messages in their threads" ON messages
    FOR INSERT WITH CHECK (
        auth.uid() = sender_id AND
        EXISTS (
            SELECT 1 FROM message_threads 
            WHERE id = messages.thread_id 
            AND (buyer_id = auth.uid() OR seller_id = auth.uid())
        )
    );

CREATE POLICY "Users can update their own messages" ON messages
    FOR UPDATE USING (auth.uid() = sender_id);

-- Create or replace functions for updating timestamps
CREATE OR REPLACE FUNCTION update_message_threads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create or replace function to update thread's last_message_at
CREATE OR REPLACE FUNCTION update_thread_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE message_threads 
    SET last_message_at = NEW.created_at
    WHERE id = NEW.thread_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_message_threads_updated_at_trigger ON message_threads;
DROP TRIGGER IF EXISTS update_messages_updated_at_trigger ON messages;
DROP TRIGGER IF EXISTS update_thread_last_message_trigger ON messages;

-- Create triggers
CREATE TRIGGER update_message_threads_updated_at_trigger
    BEFORE UPDATE ON message_threads
    FOR EACH ROW
    EXECUTE FUNCTION update_message_threads_updated_at();

CREATE TRIGGER update_messages_updated_at_trigger
    BEFORE UPDATE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_messages_updated_at();

CREATE TRIGGER update_thread_last_message_trigger
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_thread_last_message();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON message_threads TO authenticated;
GRANT SELECT, INSERT, UPDATE ON messages TO authenticated;
