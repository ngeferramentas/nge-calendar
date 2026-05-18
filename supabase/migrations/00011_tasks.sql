-- Task list (afazeres) with creator/assignee and RLS

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(trim(title)) >= 1),
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  assignee_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tasks_assignee_created_idx
  ON public.tasks (assignee_id, created_at DESC);

CREATE INDEX tasks_created_by_idx
  ON public.tasks (created_by, created_at DESC);

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_select_visible
  ON public.tasks FOR SELECT
  USING (
    created_by = auth.uid()
    OR assignee_id = auth.uid()
  );

CREATE POLICY tasks_insert_own
  ON public.tasks FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.is_admin()
      OR assignee_id = auth.uid()
    )
  );

CREATE POLICY tasks_update_visible
  ON public.tasks FOR UPDATE
  USING (
    created_by = auth.uid()
    OR assignee_id = auth.uid()
  )
  WITH CHECK (
    created_by = auth.uid()
    OR assignee_id = auth.uid()
  );

CREATE POLICY tasks_delete_visible
  ON public.tasks FOR DELETE
  USING (
    created_by = auth.uid()
    OR assignee_id = auth.uid()
  );
