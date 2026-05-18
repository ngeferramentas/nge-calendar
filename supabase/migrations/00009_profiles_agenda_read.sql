-- Allow authenticated users to read team member profiles (names, colors) for agenda joins.

CREATE POLICY profiles_select_team_agenda
  ON public.profiles FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND role IN ('admin', 'collaborator')
  );
