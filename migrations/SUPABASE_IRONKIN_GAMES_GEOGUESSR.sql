-- Apply once in Supabase SQL editor before enabling GeoGuessr.
ALTER TABLE public.ironkin_games_location_submissions ADD COLUMN IF NOT EXISTS clues_used integer NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS public.ironkin_games_location_clues (
 week_id text NOT NULL, challenge_id text NOT NULL, team_id text NOT NULL, location_id text NOT NULL,
 clues_used integer NOT NULL DEFAULT 1 CHECK (clues_used >= 1), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (week_id,challenge_id,team_id,location_id)
);
ALTER TABLE public.ironkin_games_location_clues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ironkin_games_location_clues FROM anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ironkin_games_location_clues TO service_role;
