-- Notifications and collaborator assignment at create-time

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events (id) ON DELETE SET NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_recipient_created_idx
  ON public.notifications (recipient_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_own
  ON public.notifications FOR SELECT
  USING (recipient_id = auth.uid());

CREATE POLICY notifications_insert_authenticated
  ON public.notifications FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY notifications_update_own
  ON public.notifications FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

DROP POLICY IF EXISTS events_insert ON public.events;

CREATE POLICY events_insert
  ON public.events FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.is_admin()
      OR (
        NOT public.is_admin()
        AND status = 'pending_approval'
      )
    )
  );
