# Calendar Reminder Cron Setup

Your website already has the reminder endpoint:

`/api/calendar/reminders`

That endpoint checks the calendar events and sends Discord reminders when they are due. Normal events send reminders at:

- 24 hours before start
- 1 hour before start
- 15 minutes before start

Progression/multi-day events send:

- when the event starts
- 24 hours before the event ends

Because Cloudflare Pages does not reliably run this endpoint by itself, this zip now includes a small separate Cloudflare Worker that calls the reminder endpoint every 5 minutes.

## Files added

- `workers/calendar-reminder-cron.js`
- `wrangler.reminders.jsonc`

## Deploy the reminder Worker

From the project folder, run:

```bash
npx wrangler deploy -c wrangler.reminders.jsonc
```

## Add the Worker secrets/variables

In Cloudflare, open:

Workers & Pages → ironkin-calendar-reminders → Settings → Variables and Secrets

Add these variables:

| Name | Value |
| --- | --- |
| `SITE_URL` | `https://ironkinclan.com` |
| `CALENDAR_REMINDER_SECRET` | Use the exact same value as your Pages project `CALENDAR_REMINDER_SECRET` |

The secret must match the one in your Pages project, otherwise the reminder endpoint will return Unauthorized.

## Confirm the schedule

Open:

Workers & Pages → ironkin-calendar-reminders → Settings → Triggers

You should see this cron trigger:

```text
*/5 * * * *
```

That means it checks for due reminders every 5 minutes.

## Test it

After deployment, open the Worker URL once or use:

```bash
curl https://ironkin-calendar-reminders.<your-subdomain>.workers.dev
```

A successful response should look similar to:

```json
{
  "success": true,
  "worker": "calendar-reminder-cron",
  "result": {
    "success": true,
    "checked": 1,
    "sent": 0
  }
}
```

`sent: 0` is normal when no reminder is currently due.
