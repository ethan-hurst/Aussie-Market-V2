-- SECURITY DEFINER function to write to audit_logs regardless of RLS

CREATE OR REPLACE FUNCTION public.write_audit_log(p_action TEXT, p_description TEXT, p_metadata JSONB DEFAULT '{}'::jsonb)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.audit_logs(action, description, metadata, created_at)
    VALUES (p_action, p_description, p_metadata, NOW());
END;
$$;

REVOKE ALL ON FUNCTION public.write_audit_log(TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.write_audit_log(TEXT, TEXT, JSONB) TO service_role;


