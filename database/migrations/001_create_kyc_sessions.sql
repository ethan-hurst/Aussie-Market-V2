-- Create KYC sessions table for tracking Stripe Identity verification
CREATE TABLE IF NOT EXISTS public.kyc_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    stripe_session_id TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, verified, requires_input, canceled
    verification_data JSONB,
    verified_outputs JSONB,
    last_error JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_kyc_sessions_user_id ON public.kyc_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_sessions_status ON public.kyc_sessions(status);
CREATE INDEX IF NOT EXISTS idx_kyc_sessions_created_at ON public.kyc_sessions(created_at);

-- Enable RLS
ALTER TABLE public.kyc_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "users_own_kyc_sessions" ON public.kyc_sessions
    FOR ALL USING (user_id = auth.uid());

-- Add updated_at trigger
CREATE TRIGGER update_kyc_sessions_updated_at BEFORE UPDATE ON public.kyc_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add KYC session tracking to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS kyc_session_id UUID REFERENCES public.kyc_sessions(id),
ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ;

-- Create function to update user KYC status when session is updated
CREATE OR REPLACE FUNCTION update_user_kyc_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Update user KYC status based on session status
    IF NEW.status = 'verified' THEN
        UPDATE public.users 
        SET kyc = 'passed', kyc_verified_at = NOW()
        WHERE id = NEW.user_id;
    ELSIF NEW.status = 'requires_input' OR NEW.last_error IS NOT NULL THEN
        UPDATE public.users 
        SET kyc = 'failed'
        WHERE id = NEW.user_id;
    ELSIF NEW.status = 'pending' THEN
        UPDATE public.users 
        SET kyc = 'pending'
        WHERE id = NEW.user_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update user KYC status
CREATE TRIGGER update_user_kyc_on_session_change
    AFTER UPDATE ON public.kyc_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_user_kyc_status();
