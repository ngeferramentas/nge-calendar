-- Neighborhood for clients; displayed with logradouro (address_line) on event detail.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS bairro text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.clients.bairro IS 'Neighborhood (bairro); optional complement to address_line (logradouro).';
