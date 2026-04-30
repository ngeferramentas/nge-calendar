DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own
  ON public.notifications FOR DELETE
  USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS clients_insert_admin ON public.clients;
CREATE POLICY clients_insert_authenticated
  ON public.clients FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());
