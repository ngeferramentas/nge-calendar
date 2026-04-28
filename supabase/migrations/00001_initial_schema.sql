-- NGE Calendar: profiles, clients, events, audit_logs
-- Run in Supabase SQL Editor or via supabase db push

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums as check constraints (no custom types for simpler JS interop)

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'collaborator' CHECK (role IN ('admin', 'collaborator')),
  can_manage_users boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL CHECK (document_type IN ('cpf', 'cnpj')),
  document_normalized text NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  address_line text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  postal_code text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clients_document_normalized_unique UNIQUE (document_normalized)
);

CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  collaborator_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending_approval' CHECK (
    status IN (
      'pending_approval',
      'approved',
      'confirmed',
      'assigned',
      'rejected'
    )
  ),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  approved_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  approved_at timestamptz,
  assigned_at timestamptz,
  reminder_sent_at timestamptz,
  CONSTRAINT events_time_order CHECK (ends_at > starts_at)
);

CREATE INDEX events_starts_at_idx ON public.events (starts_at);
CREATE INDEX events_collaborator_id_idx ON public.events (collaborator_id);
CREATE INDEX events_status_idx ON public.events (status);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_created_at_idx ON public.audit_logs (created_at DESC);

-- updated_at touch
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- First signup becomes admin when profiles was empty
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles LIMIT 1) INTO is_first;
  INSERT INTO public.profiles (id, full_name, role, can_manage_users)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    CASE WHEN is_first THEN 'admin' ELSE 'collaborator' END,
    CASE WHEN is_first THEN true ELSE false END
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Audit: only callable with current user as actor (no forging)
CREATE OR REPLACE FUNCTION public.append_audit_log(
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, metadata)
  VALUES (p_entity_type, p_entity_id, p_action, auth.uid(), COALESCE(p_metadata, '{}'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- RLS helpers
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  );
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY profiles_select_self_or_admin
  ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY profiles_update_self
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_admin_update_all
  ON public.profiles FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- clients: admin full CRUD; collaborators read-only for event linking
CREATE POLICY clients_select_authenticated
  ON public.clients FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY clients_insert_admin
  ON public.clients FOR INSERT
  WITH CHECK (public.is_admin() AND created_by = auth.uid());

CREATE POLICY clients_update_admin
  ON public.clients FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY clients_delete_admin
  ON public.clients FOR DELETE
  USING (public.is_admin());

-- events
CREATE POLICY events_select
  ON public.events FOR SELECT
  USING (
    public.is_admin()
    OR collaborator_id = auth.uid()
    OR (created_by = auth.uid() AND status = 'pending_approval')
  );

CREATE POLICY events_insert
  ON public.events FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.is_admin()
      OR (
        NOT public.is_admin()
        AND status = 'pending_approval'
        AND collaborator_id IS NULL
      )
    )
  );

CREATE POLICY events_update_admin
  ON public.events FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY events_delete_admin
  ON public.events FOR DELETE
  USING (public.is_admin());

-- audit_logs
CREATE POLICY audit_logs_select_admin
  ON public.audit_logs FOR SELECT
  USING (public.is_admin());

CREATE POLICY audit_logs_insert_authenticated
  ON public.audit_logs FOR INSERT
  WITH CHECK (actor_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
