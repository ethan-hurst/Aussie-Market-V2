-- Add missing KYC fields to users table for Stripe Identity integration

-- Add new columns for KYC tracking
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS stripe_identity_session_id TEXT,
ADD COLUMN IF NOT EXISTS kyc_details JSONB,
ADD COLUMN IF NOT EXISTS kyc_completed_at TIMESTAMPTZ;

-- Add index for Stripe Identity session lookups
CREATE INDEX IF NOT EXISTS idx_users_stripe_identity_session_id 
ON public.users(stripe_identity_session_id);

-- Add index for KYC completion tracking
CREATE INDEX IF NOT EXISTS idx_users_kyc_completed_at 
ON public.users(kyc_completed_at);

-- Create function to handle KYC webhook updates
CREATE OR REPLACE FUNCTION handle_kyc_webhook_update(
    p_stripe_session_id TEXT,
    p_status TEXT,
    p_verified_outputs JSONB DEFAULT NULL,
    p_last_error JSONB DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_kyc_status kyc_status;
    v_kyc_details JSONB;
BEGIN
    -- Find user by Stripe Identity session ID
    SELECT id INTO v_user_id
    FROM public.users
    WHERE stripe_identity_session_id = p_stripe_session_id;

    IF v_user_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'User not found for session ID'
        );
    END IF;

    -- Map Stripe status to our KYC status
    CASE p_status
        WHEN 'verified' THEN
            v_kyc_status := 'passed';
            v_kyc_details := json_build_object(
                'verified_at', NOW(),
                'verified_outputs', p_verified_outputs
            );
        WHEN 'requires_input', 'processing' THEN
            v_kyc_status := 'pending';
            v_kyc_details := json_build_object(
                'status', p_status,
                'updated_at', NOW()
            );
        WHEN 'canceled', 'verification_failed' THEN
            v_kyc_status := 'failed';
            v_kyc_details := json_build_object(
                'failed_at', NOW(),
                'failure_reason', COALESCE(p_last_error->>'reason', 'Verification failed'),
                'last_error', p_last_error
            );
        ELSE
            v_kyc_status := 'pending';
            v_kyc_details := json_build_object(
                'status', p_status,
                'updated_at', NOW()
            );
    END CASE;

    -- Update user KYC status
    UPDATE public.users
    SET 
        kyc = v_kyc_status,
        kyc_details = v_kyc_details,
        kyc_completed_at = CASE WHEN v_kyc_status = 'passed' THEN NOW() ELSE kyc_completed_at END,
        updated_at = NOW()
    WHERE id = v_user_id;

    RETURN json_build_object(
        'success', true,
        'user_id', v_user_id,
        'kyc_status', v_kyc_status
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION handle_kyc_webhook_update TO authenticated;
GRANT EXECUTE ON FUNCTION handle_kyc_webhook_update TO service_role;
