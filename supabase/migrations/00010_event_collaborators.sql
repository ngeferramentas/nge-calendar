-- Multiple collaborators per event (junction table).

CREATE TABLE public.event_collaborators (
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  collaborator_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, collaborator_id)
);

CREATE INDEX event_collaborators_collaborator_id_idx
  ON public.event_collaborators (collaborator_id);

INSERT INTO public.event_collaborators (event_id, collaborator_id)
SELECT id, collaborator_id
FROM public.events
WHERE collaborator_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.event_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_collaborators_select_authenticated
  ON public.event_collaborators FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY event_collaborators_insert
  ON public.event_collaborators FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.created_by = auth.uid()
    )
  );

CREATE POLICY event_collaborators_delete
  ON public.event_collaborators FOR DELETE
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.created_by = auth.uid()
    )
  );

COMMENT ON TABLE public.event_collaborators IS 'Many-to-many assignees for calendar events; events.collaborator_id is the primary (first) assignee.';
