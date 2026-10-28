// Plugin drop screenshots: stored for review only, in one place, and never
// copied into a submission row. Run with: node --test tests/
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { onRequestPost } from "../functions/events/[eventId]/submissions.js";
import { hybridKv } from "../functions/_hybridKv.js";
import { insertEventSubmission, updateEventSubmission } from "../functions/api/_supabase.js";
import { containsImagePayload } from "../functions/api/_noImagePayload.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const API_KEY = "ik_test";
const DISCORD_ID = "100";
const ITEM_ID = 20997;

// In-memory Supabase (PostgREST) plus a legacy KV binding, recording every call.
function fakeBackend() {
  const store = new Map(); // "namespace|key" -> row
  const submissions = new Map();
  const requests = [];
  const kvPuts = [];
  store.set(`drops|plugin-api-key:${API_KEY}`, { value: JSON.stringify({ discordId: DISCORD_ID, displayName: "Zezima" }) });

  async function fetchStub(input, init = {}) {
    const url = new URL(String(input));
    const method = (init.method || "GET").toUpperCase();
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    requests.push({ method, path: url.pathname, search: url.search, body });
    const table = url.pathname.replace(/^\/rest\/v1\//, "");
    const eq = name => url.searchParams.get(name)?.replace(/^eq\./, "");
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

    if (table === "website_store") {
      if (method === "GET") {
        const row = store.get(`${eq("namespace")}|${eq("key")}`);
        return json(row ? [row] : []);
      }
      if (method === "POST") {
        for (const row of body) store.set(`${row.namespace}|${row.key}`, row);
        return new Response(null, { status: 201 });
      }
      if (method === "DELETE") {
        store.delete(`${eq("namespace")}|${eq("key")}`);
        return new Response(null, { status: 204 });
      }
    }
    if (table === "ironkin_event_items") {
      return json(Number(eq("item_id")) === ITEM_ID
        ? [{ website_event_id: "pvm-entry", plugin_event_id: "pvm-entry", item_id: ITEM_ID, item_name: "Twisted bow", tracking_rule: "repeatable" }]
        : []);
    }
    if (table === "ironkin_event_submissions") {
      if (method === "GET") return json([]);
      if (method === "POST") {
        for (const row of body) submissions.set(row.id, { ...row });
        return json(body);
      }
      if (method === "PATCH") {
        const row = submissions.get(eq("id"));
        if (row) Object.assign(row, body);
        return new Response(null, { status: 204 });
      }
    }
    throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`);
  }

  const kv = {
    data: new Map(),
    async get(key) { return this.data.has(key) ? this.data.get(key) : null; },
    async put(key, value, options) { kvPuts.push({ key, options }); this.data.set(key, value); },
    async delete(key) { this.data.delete(key); }
  };

  const env = { SUPABASE_URL: "https://db.example", SUPABASE_SECRET_KEY: "sb_secret_test", DROPS_KV: kv };
  return { env, store, submissions, requests, kvPuts, kv, fetchStub };
}

let backend;
let realFetch;
beforeEach(() => {
  backend = fakeBackend();
  realFetch = globalThis.fetch;
  globalThis.fetch = backend.fetchStub;
});
afterEach(() => { globalThis.fetch = realFetch; });

async function postDrop(body) {
  const request = new Request("https://ironkin.example/events/pvm-entry/submissions", {
    method: "POST",
    headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ username: "Zezima", itemid: ITEM_ID, quantity: 1, timestamp: 1710000000000, ...body })
  });
  const response = await onRequestPost({ request, env: backend.env, params: { eventId: "pvm-entry" } });
  return { status: response.status, body: await response.json() };
}

const imageRows = () => [...backend.store.entries()].filter(([k]) => k.startsWith("drops|event-submission-image:"));

for (const [label, imageData] of [["raw base64", PNG], ["a data: URL", `data:image/png;base64,${PNG}`]]) {
  test(`a drop with ${label} stores one review copy, keyed by the submission, with an expiry`, async () => {
    const { status, body } = await postDrop({ imageData });
    assert.equal(status, 201);

    const rows = imageRows();
    assert.equal(rows.length, 1);
    const [key, row] = rows[0];
    assert.equal(key, `drops|event-submission-image:${body.submissionId}`);
    assert.equal(row.value, PNG);
    const ttlDays = (new Date(row.expires_at).getTime() - Date.now()) / 86_400_000;
    assert.ok(ttlDays > 13.9 && ttlDays <= 14, `expected ~14 day expiry, got ${ttlDays}`);

    // Never the legacy KV, never Storage.
    assert.deepEqual(backend.kvPuts, []);
    assert.ok(!backend.requests.some(r => r.path.startsWith("/storage/v1/")));

    // The submission row holds a link to the review copy, not the bytes.
    const saved = backend.submissions.get(body.submissionId);
    assert.equal(saved.proof_url, `https://ironkin.example/api/event-submission-image?id=${body.submissionId}`);
    assert.ok(!JSON.stringify(saved).includes(PNG));
  });
}

test("a drop without a screenshot is unchanged", async () => {
  const { status, body } = await postDrop({});
  assert.equal(status, 201);
  assert.equal(body.success, true);
  assert.equal(body.status, "pending");
  assert.equal(imageRows().length, 0);
  const saved = backend.submissions.get(body.submissionId);
  assert.equal(saved.proof_url, "");
  assert.equal(saved.item_name, "Twisted bow");
  assert.equal(saved.player_name, "Zezima");
  assert.equal(saved.discord_id, DISCORD_ID);
  assert.equal(saved.source, "runelite");
  assert.equal(saved.status, "pending");
});

test("an untracked item is still a 404 and stores nothing", async () => {
  const { status } = await postDrop({ itemid: 1, imageData: PNG });
  assert.equal(status, 404);
  assert.equal(imageRows().length, 0);
});

test("reading a legacy KV-only screenshot never copies it into Supabase", async () => {
  backend.kv.data.set("event-submission-image:legacy-1", PNG);
  const value = await hybridKv(backend.env, "drops").get("event-submission-image:legacy-1");
  assert.equal(value, PNG);
  assert.ok(!backend.requests.some(r => r.method === "POST" && r.path.endsWith("/website_store")));
  assert.equal(imageRows().length, 0);
});

test("other keys still lazy-migrate from KV as before", async () => {
  backend.kv.data.set("events:active", "[]");
  await hybridKv(backend.env, "drops").get("events:active");
  assert.ok(backend.store.has("drops|events:active"));
});

test("once the bot deletes a screenshot, the image endpoint 404s", async () => {
  const { onRequestGet } = await import("../functions/api/event-submission-image.js");
  const { body } = await postDrop({ imageData: PNG });
  const url = `https://ironkin.example/api/event-submission-image?id=${body.submissionId}`;

  const served = await onRequestGet({ request: new Request(url), env: backend.env });
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("Cache-Control"), "private, no-store");

  backend.store.delete(`drops|event-submission-image:${body.submissionId}`); // what the bot's decision does
  const gone = await onRequestGet({ request: new Request(url), env: backend.env });
  assert.equal(gone.status, 404);
});

test("submission rows refuse image bytes in any field", async () => {
  const base = { id: "s1", item_name: "Twisted bow", proof_url: "" };
  for (const bad of [
    { proof_url: `data:image/png;base64,${PNG}` },
    { proof_url: PNG },
    { proof_url: "javascript:alert(1)" },
    { item_name: PNG },
    { participants: ["Alt", `data:image/jpeg;base64,/9j/4AAQ`] }
  ]) {
    await assert.rejects(insertEventSubmission(backend.env, { ...base, ...bad }), /Refusing to store image data/);
    await assert.rejects(updateEventSubmission(backend.env, "s1", bad), /Refusing to store image data/);
  }
  assert.ok(!backend.requests.some(r => r.path.endsWith("/ironkin_event_submissions")));
});

test("submission rows still accept links and ordinary values", async () => {
  await insertEventSubmission(backend.env, { id: "s2", item_name: "Twisted bow", proof_url: "https://cdn.discordapp.com/a/b/proof.png", participants: ["Alt"] });
  await updateEventSubmission(backend.env, "s2", { proof_url: "" });
  assert.equal(backend.submissions.get("s2").proof_url, "");
});

test("image signature detection", () => {
  assert.ok(containsImagePayload(PNG));
  assert.ok(containsImagePayload("/9j/4AAQSkZJRg"));
  assert.ok(containsImagePayload("R0lGODlhAQABAAAAACw="));
  assert.ok(containsImagePayload("UklGRiQAAABXRUJQ"));
  assert.ok(containsImagePayload("DATA:text/plain,hi"));
  assert.ok(!containsImagePayload("Twisted bow"));
  assert.ok(!containsImagePayload("https://example.com/x.png"));
  assert.ok(!containsImagePayload(42));
});
