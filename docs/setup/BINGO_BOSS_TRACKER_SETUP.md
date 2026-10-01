# Bingo Boss Kill Tracker Setup

The website now tracks how many bosses every Battleship Bingo participant kills during the competition, using the Wise Old Man API.

How it works:

1. When the competition starts (the `boardRevealAt` time in the bingo settings), the tracker takes a **baseline snapshot** of every signed-up member's boss kill counts.
2. A cron Worker re-fetches everyone's kill counts **every 2 hours** and stores the totals.
3. A standalone **Battleship Stats page** (`/battleship-stats`) with an All / Team 1 / Team 2 toggle shows total kills during the event, the team-vs-team split, top slayers, and the most hunted bosses. It shows per-boss kill counts during the event. The Battleship Bingo board page itself is untouched.

Because Wise Old Man rate-limits API calls, each refresh runs in small batches (9 players at a time, spaced ~1 minute apart). A full sweep of ~47 players takes about 6 minutes.

## Files added

- `functions/api/bingo/_bossTracker.js` — shared tracker logic
- `functions/api/bingo/boss-tracker.js` — public GET (summary) + protected POST (refresh one batch)
- `functions/api/admin/bingo/boss-tracker.js` — staff actions: `set-rsn`, `clear-rsn`, `reset`
- `workers/bingo-boss-tracker-cron.js` — the 2-hour cron Worker
- `wrangler.bingo-tracker.jsonc` — Worker config
- `battleship-stats.html` / `battleship-stats.js` — the standalone stats page (styles are inline in the page; `styles.css` is untouched)

Tracker state lives in the `DROPS_KV` namespace under `bingo:boss-tracker`.

## Which bosses count

`EVENT_BOSS_METRICS` at the top of `functions/api/bingo/_bossTracker.js` lists the WOM boss metrics that count for the event (the bosses the board tiles come from). An empty list means every boss counts. Snapshots always store **all** bosses regardless of this list, so editing it mid-event recalculates the stats page retroactively — nothing is ever lost.

`EVENT_ACTIVITY_METRICS` (same file) adds hiscores *activities* to the count — currently Guardians of the Rift, whose number is rifts closed. Unlike the boss list, an empty activity list means **no** activities count (otherwise clue scrolls and the like would pollute totals). All activities are stored in snapshots too, so this list is also retroactive.

## Deploy the cron Worker

From the project folder, run:

```bash
npx wrangler deploy -c wrangler.bingo-tracker.jsonc
```

## Add the Worker secrets/variables

In Cloudflare, open:

Workers & Pages → ironkin-bingo-boss-tracker → Settings → Variables and Secrets

| Name | Value |
| --- | --- |
| `SITE_URL` | `https://ironkinclan.com` |
| `BINGO_TRACKER_SECRET` | Any long random string. Must match the Pages project value below. |

Then in your **Pages project** (ironkin-website) add the same variable:

| Name | Value |
| --- | --- |
| `BINGO_TRACKER_SECRET` | Same value as the Worker |
| `WOM_API_KEY` | *(optional)* A Wise Old Man API key raises the rate limit. Ask in the WOM Discord. |

If `BINGO_TRACKER_SECRET` is not set anywhere, the refresh endpoint stays open (same behaviour as the calendar reminder endpoint), so setting it is recommended.

## Confirm the schedule

Workers & Pages → ironkin-bingo-boss-tracker → Settings → Triggers should show:

```text
0 */2 * * *
```

That fires at every even UTC hour — including 16:00 UTC, so if the board reveal is on an even hour the baseline is taken right at the start of the event.

## How members are matched to RuneScape names

The tracker assumes the Discord nickname is the RSN. For names like `apey | Apie` it tries each part, preferring names that are members of the clan's WOM group (12095). Anyone matched this way is labelled **auto-matched** on the Battleship Stats page — staff should double-check those.

Five members have staff-verified RSNs hardcoded as defaults in `functions/api/bingo/_bossTracker.js` (`DEFAULT_RSN_OVERRIDES`, keyed by Discord ID): apey → `apey`, Evil-gunter → `Evil-gunter`, GIM Seedling → `GIM Seedling`, David → `Bakara`, Solo Ikigai → `soloikigai`. A **Set RSN** change made on the stats page always wins over these defaults.

Staff tools on the Battleship Stats page:

- **Set RSN** next to any unmatched member — fixes the name and re-baselines that member on the next refresh.
- **Refresh Next Batch** — force-runs one batch immediately.
- **Reset Baseline** — wipes all counts; the next sweep takes a fresh baseline for everyone.

Note: a member whose RSN is fixed mid-event only counts kills from the moment their correct baseline is taken.

## Test it

After deployment:

```bash
# Trigger a sweep manually (runs batches until the cycle completes)
curl https://ironkin-bingo-boss-tracker.<your-subdomain>.workers.dev

# View the public summary
curl https://ironkinclan.com/api/bingo/boss-tracker
```

Before the board reveal time the sweep responds with `waiting: true` — that is normal. After the reveal, the first sweep stores the baseline and the Battleship Stats page starts showing totals (all zeros at first).
