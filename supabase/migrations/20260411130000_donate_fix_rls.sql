-- Fix donate RLS policies to use is_staff_user() like the rest of the project

DROP POLICY IF EXISTS "donate_config_write_admin" ON donate_config;
DROP POLICY IF EXISTS "donate_sessions_admin_update" ON donate_sessions;

CREATE POLICY "donate_config_write_admin" ON donate_config
  FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "donate_sessions_admin_update" ON donate_sessions
  FOR UPDATE
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());
