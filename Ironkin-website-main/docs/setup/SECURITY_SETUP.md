# Ironkin security fix setup

This patch changes Discord login sessions from editable Base64 JSON cookies to HMAC-signed cookies.

## Required Cloudflare setting

Add this secret before deploying, otherwise Discord login will fail because the site cannot sign/verify sessions:

```bash
wrangler secret put SESSION_SECRET
```

Use a long random value, for example 32+ random characters.

If you do not use Wrangler, add `SESSION_SECRET` in Cloudflare Pages > Settings > Environment variables > Production > Secrets.

## After deployment

1. Deploy the patched site.
2. Have staff log out and log back in.
3. Old unsigned `ironkin_session` cookies will be rejected automatically.

## What changed

- `functions/api/_auth.js` now creates and verifies signed session cookies.
- `/api/auth/me` now rejects edited/unsigned cookies.
- Admin, drops, bingo, giveaway, profile, and calendar APIs now check staff roles from the verified session only.
- Discord OAuth login now uses a temporary `state` cookie to reduce login CSRF risk.
