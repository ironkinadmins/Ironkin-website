# Ironkin plugin drop ingest

Hand this to the RuneLite plugin author. It is the retry/idempotency contract for `POST /events/{pluginEventId}/submissions`.

Base URL: `https://ironkinclan.com`

Auth: header `x-api-key: <member plugin key>` on every request. Keys are issued on the member’s website profile.

---

## What changed on the website

The server now inserts the drop **before** storing the screenshot.

- A screenshot timeout/failure must **not** lose the drop.
- A retry of the **same loot event** must **not** create a second row.
- Transient ingest failures return **503** with `retryable: true` instead of an uncaught 500.

The plugin still has to retry correctly. The server can only dedupe if the plugin resends the same payload.

---

## Freeze the payload at loot time

When a tracked item drops, build **one** submission object and keep it until success or a non-retryable error.

Required:

- `timestamp` — set **once** when the loot is detected (epoch millis). Never regenerate on retry.
- `itemid` — OSRS item ID from `/events/item-list`
- `quantity`
- `username` — submitting RSN
- URL `{pluginEventId}` from `/events/item-list`

Optional, but if present they must stay the same on retry:

- `participants` — other RSNs, max 20, excluding `username`
- `imageData` — PNG/JPEG base64, optional `data:image/...;base64,` prefix, max **15 MB** decoded
- `itemName`

If `timestamp` is omitted, the server uses `Date.now()`. Retries then look like new drops.

Dedup key on the server (SHA-256):

```text
{pluginEventId}|{discordId}|{itemId}|{quantity}|{ISO timestamp}
```

Same loot + same timestamp = same key. New `Date.now()` on retry = new key = possible duplicate for `repeatable` items.

---

## POST body

```http
POST /events/{pluginEventId}/submissions
Content-Type: application/json
x-api-key: ik_...
```

```json
{
  "username": "PlayerName",
  "itemid": 12345,
  "quantity": 1,
  "timestamp": 1710000000000,
  "participants": ["AltName"],
  "imageData": "<base64 or data-url>"
}
```

`itemId` is accepted as an alias of `itemid`.

---

## How to treat responses

| HTTP | Body | Plugin action |
| --- | --- | --- |
| **201** | `{ "success": true, "submissionId": "...", "status": "pending" }` | Done. Show submitted. |
| **200** | `{ "success": true, "duplicate": true, "duplicateReason": "...", "submissionId": "..." }` | Done. Same as success. Do **not** POST again. |
| **400** | `{ "error": "..." }` | Do not retry. Bad JSON / missing username / invalid itemid. |
| **401** | `{ "error": "Missing x-api-key header." }` or invalid key | Do not retry. Member must paste a current profile key. |
| **404** | event not active, or item not tracked | Do not retry this event/item until item-list says it is live. |
| **413** | `imageData` too large | Do not retry the same image. Compress/omit screenshot, keep the same `timestamp`. |
| **503** | `{ "error": "...", "retryable": true }` | Retry the **identical** JSON. |
| Timeout, connection error, **502**, **500** | — | Treat as retryable. Retry the **identical** JSON. |

`201` means the drop is stored. The screenshot is attached in the background. Do not poll for the image and do not wait for proof before marking success.

A request that times out on the client may still have inserted the row. Retrying with the same `timestamp` then returns **200 duplicate**, which is correct.

---

## Retry policy

Retry only:

- `503` with `retryable: true`
- `500` / `502` / `504`
- `408` / `429`
- DNS / connection / TLS / read timeouts

Do **not** retry `400`, `401`, `404` (except after a later item-list refresh), or `413` with the same image.

Suggested:

- 3–5 attempts
- exponential backoff, e.g. 1s, 2s, 4s
- replay the **exact** frozen JSON (same `timestamp`, `itemid`, `quantity`, `username`, `participants`, screenshot)

Queue locally if the player hops worlds / logs out mid-retry, still using that frozen payload.

---

## Item list (unchanged)

```http
GET /events/item-list
x-api-key: ik_...
```

Alias: `GET /events/list-items`

```json
{
  "events": [
    {
      "eventId": "pvm-entry",
      "items": [12345, 67890],
      "eventPassword": "optional"
    }
  ]
}
```

- `eventId` is the plugin event id used in the submit URL.
- `items` are OSRS item IDs to watch. Names are not sent.
- `eventPassword` is optional UI/unlock for the plugin. Submit does **not** check it; `x-api-key` is the auth.
- `pvm-entry` is always included when it has items. Other events appear only when they are active **and** drops-enabled.

Only submit an `itemid` that is on that event’s `items` list, or the server returns 404.

---

## Duplicate reasons you may see

These are all success for the plugin (`200` + `duplicate: true`):

- `same_submission` — this exact loot event (same timestamp) was already stored, including a retried POST
- `once_per_player` — this player already submitted this item for this event
- `once_per_event` — someone in the clan already submitted this item for this event
- `unique_constraint` — same as above; race on the unique index

Do not surface these as errors unless you want a softer “already submitted” toast.

---

## Checklist

- [ ] `timestamp` is set once per loot event and reused on every retry
- [ ] `200` + `duplicate: true` is treated as success
- [ ] `201` is treated as success even if no screenshot confirmation comes back
- [ ] `503` / timeouts retry the identical body
- [ ] `400` / `401` / `404` / `413` are not blindly retried
- [ ] retries do not call `Date.now()` again
- [ ] omitted `timestamp` is not relied on for idempotency
