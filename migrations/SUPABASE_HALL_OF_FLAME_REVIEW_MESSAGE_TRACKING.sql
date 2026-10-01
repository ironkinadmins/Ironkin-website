-- Hall of Flame: remember the private Discord review message so it can be
-- edited in place after staff approves/rejects/removes a submission.

alter table public.hall_of_flame_submissions
  add column if not exists review_discord_message_id text,
  add column if not exists review_discord_channel_id text;

comment on column public.hall_of_flame_submissions.review_discord_message_id is
  'Discord message ID for the private Hall of Flame review notification.';
comment on column public.hall_of_flame_submissions.review_discord_channel_id is
  'Discord channel ID containing the private Hall of Flame review notification.';
