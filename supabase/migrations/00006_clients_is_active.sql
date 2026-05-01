-- Active flag: inactive clients remain selectable when creating events (search has no filter).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.clients.is_active IS 'When false, client is deactivated in CRM but still searchable for event linking.';
