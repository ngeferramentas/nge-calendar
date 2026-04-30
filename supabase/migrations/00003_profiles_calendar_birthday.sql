-- Collaborator calendar color and birthday (agenda)

ALTER TABLE public.profiles
  ADD COLUMN calendar_color text NOT NULL DEFAULT '#4285F4',
  ADD COLUMN birth_date date;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_calendar_color_hex_check
  CHECK (calendar_color ~ '^#[0-9A-Fa-f]{6}$');

COMMENT ON COLUMN public.profiles.calendar_color IS 'Hex color for agenda events assigned to this collaborator';
COMMENT ON COLUMN public.profiles.birth_date IS 'Optional birth date; shown as annual birthday on team calendar';
