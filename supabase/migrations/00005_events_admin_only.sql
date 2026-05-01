-- Events visible to all authenticated users except admin-only rows (admins see all).

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS admin_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.admin_only IS 'When true, only admins can SELECT this row (personal/internal events).';

DROP POLICY IF EXISTS events_select ON public.events;

CREATE POLICY events_select
  ON public.events FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.is_admin()
      OR COALESCE(admin_only, false) = false
    )
  );
