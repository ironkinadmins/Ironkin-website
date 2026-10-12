-- Staff-only GeoGuessr test data. Run once in Supabase SQL Editor.
-- Separate physical tables guarantee test submissions/clue reveals never affect live results.
CREATE TABLE IF NOT EXISTS public.ironkin_games_location_submissions_test
 (LIKE public.ironkin_games_location_submissions INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.ironkin_games_location_clues_test
 (LIKE public.ironkin_games_location_clues INCLUDING ALL);
-- Use server-side service role access only; deny direct client access.
REVOKE ALL ON public.ironkin_games_location_submissions_test FROM anon, authenticated;
REVOKE ALL ON public.ironkin_games_location_clues_test FROM anon, authenticated;
-- To reset ONLY GeoGuessr test data:
-- TRUNCATE public.ironkin_games_location_submissions_test, public.ironkin_games_location_clues_test;
