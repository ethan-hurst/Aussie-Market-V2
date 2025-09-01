-- Broaden admin access via RLS policies for admin role in JWT

DO $$
BEGIN
    -- Users table admin read
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='users' AND policyname='users_admin_read'
    ) THEN
        CREATE POLICY users_admin_read ON public.users FOR SELECT
            USING (auth.jwt() ->> 'role' = 'admin');
    END IF;

    -- Orders admin read
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orders' AND policyname='orders_admin_read'
    ) THEN
        CREATE POLICY orders_admin_read ON public.orders FOR SELECT
            USING (auth.jwt() ->> 'role' = 'admin');
    END IF;

    -- Disputes admin read/write
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='disputes' AND policyname='disputes_admin_read'
    ) THEN
        CREATE POLICY disputes_admin_read ON public.disputes FOR SELECT
            USING (auth.jwt() ->> 'role' = 'admin');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='disputes' AND policyname='disputes_admin_update'
    ) THEN
        CREATE POLICY disputes_admin_update ON public.disputes FOR UPDATE
            USING (auth.jwt() ->> 'role' = 'admin')
            WITH CHECK (auth.jwt() ->> 'role' = 'admin');
    END IF;

    -- Notifications admin read
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_admin_read'
    ) THEN
        CREATE POLICY notifications_admin_read ON public.notifications FOR SELECT
            USING (auth.jwt() ->> 'role' = 'admin');
    END IF;
END$$;


