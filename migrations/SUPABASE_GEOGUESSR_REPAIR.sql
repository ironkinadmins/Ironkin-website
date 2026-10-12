-- Ironkin GeoGuessr: idempotent live + staff-test database setup.
-- Keeps existing submissions and scores. Does not reset data.
BEGIN;
ALTER TABLE public.ironkin_games_location_submissions
  ADD COLUMN IF NOT EXISTS clues_used integer NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS public.ironkin_games_location_clues (
  week_id text NOT NULL,
  challenge_id text NOT NULL,
  team_id text NOT NULL,
  location_id text NOT NULL,
  clues_used integer NOT NULL DEFAULT 1 CHECK (clues_used >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (week_id, challenge_id, team_id, location_id)
);
CREATE TABLE IF NOT EXISTS public.ironkin_games_location_submissions_test
  (LIKE public.ironkin_games_location_submissions INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.ironkin_games_location_clues_test
  (LIKE public.ironkin_games_location_clues INCLUDING ALL);
ALTER TABLE public.ironkin_games_location_clues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ironkin_games_location_submissions_test ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ironkin_games_location_clues_test ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ironkin_games_location_clues FROM anon, authenticated;
REVOKE ALL ON public.ironkin_games_location_submissions_test FROM anon, authenticated;
REVOKE ALL ON public.ironkin_games_location_clues_test FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ironkin_games_location_submissions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ironkin_games_location_clues TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ironkin_games_location_submissions_test TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ironkin_games_location_clues_test TO service_role;
COMMIT;
