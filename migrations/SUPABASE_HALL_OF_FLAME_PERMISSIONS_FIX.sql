-- Hall of Flame backend permissions repair.
-- Safe to run more than once.
-- The Hall of Flame tables remain inaccessible to anon/authenticated clients;
-- Cloudflare Functions access them with the server-side service/secret key.

grant usage on schema public to service_role;
grant all privileges on table public.hall_of_flame_bosses to service_role;
grant all privileges on table public.hall_of_flame_submissions to service_role;

-- Explicitly keep direct browser roles locked out. All Hall of Flame writes and
-- staff reads are mediated by authenticated Ironkin Cloudflare Functions.
revoke all privileges on table public.hall_of_flame_bosses from anon, authenticated;
revoke all privileges on table public.hall_of_flame_submissions from anon, authenticated;
