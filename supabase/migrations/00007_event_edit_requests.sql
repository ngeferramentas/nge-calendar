-- Pending edit requests from collaborators (events remain unchanged until approved by a manager).

CREATE TABLE public.event_edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX event_edit_requests_one_pending_per_event
  ON public.event_edit_requests (event_id)
  WHERE status = 'pending';

CREATE INDEX event_edit_requests_status_idx ON public.event_edit_requests (status);
CREATE INDEX event_edit_requests_event_id_idx ON public.event_edit_requests (event_id);

COMMENT ON TABLE public.event_edit_requests IS 'Collaborator-proposed event patches; managers approve via server actions.';

ALTER TABLE public.event_edit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_edit_requests_insert_own
  ON public.event_edit_requests FOR INSERT
  WITH CHECK (requested_by = auth.uid());

CREATE POLICY event_edit_requests_select_own_or_admin
  ON public.event_edit_requests FOR SELECT
  USING (requested_by = auth.uid() OR public.is_admin());

CREATE POLICY event_edit_requests_update_admin
  ON public.event_edit_requests FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
