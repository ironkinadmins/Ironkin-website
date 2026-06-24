import { getSession, isStaffSession } from "../../_auth.js";
const EVENT_TEMPLATES_KEY = "calendar:event-templates";

const DEFAULT_TEMPLATES = {
  "botw-elite": { key: "botw-elite", label: "BOTW Elite", title: "Boss of the Week - Elite", type: "botw-elite", start: "7:00", end: "7:00", durationDays: 7, wom: true, discord: false, description: "" },
  "botw-standard": { key: "botw-standard", label: "BOTW Standard", title: "Boss of the Week", type: "botw-standard", start: "7:00", end: "7:00", durationDays: 7, wom: true, discord: false, description: "" },
  sotw: { key: "sotw", label: "SOTW", title: "Skill of the Week", type: "sotw", start: "7:00", end: "7:00", durationDays: 7, wom: true, discord: false, description: "" },
  "clan-goal": { key: "clan-goal", label: "Clan Goal", title: "Clan Goal - ", type: "clan-goal", start: "3:00", end: "3:00", durationDays: 30, wom: true, discord: false, description: "" },
  mass: { key: "mass", label: "Clan Mass", title: "Clan Mass", type: "mass", start: "3:00", end: "4:00", durationDays: 0, wom: false, discord: true, description: "" },
  giveaway: { key: "giveaway", label: "Giveaway", title: "Giveaway", type: "giveaway", start: "7:00", end: "8:00", durationDays: 0, wom: false, discord: true, description: "" },
  challenge: { key: "challenge", label: "Photo/Clan Challenge", title: "Photo Challenge", type: "challenge", start: "7:00", end: "7:00", durationDays: 1, wom: false, discord: true, description: "" },
  "clog-week": { key: "clog-week", label: "CLog Week", title: "CLog Week", type: "normal", start: "7:00", end: "7:00", durationDays: 7, wom: false, discord: true, description: "" }
};

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function cleanText(value, fallback = "") {
  return String(value || fallback).trim();
}

function normalizeTemplate(value = {}, fallbackKey = "") {
  const label = cleanText(value.label || value.name || value.title, fallbackKey || "Template");
  const key = normalizeKey(value.key || fallbackKey || label);
  if (!key) return null;

  return {
    key,
    label,
    title: cleanText(value.title, label),
    type: cleanText(value.type || value.eventType, "normal"),
    start: cleanText(value.start, "7:00"),
    end: cleanText(value.end, "8:00"),
    durationDays: Math.max(0, Math.min(Number(value.durationDays || 0), 365)),
    wom: value.wom === true,
    discord: value.discord === true,
    description: cleanText(value.description)
  };
}

function normalizeTemplates(input) {
  const source = input && typeof input === "object" ? input : DEFAULT_TEMPLATES;
  const entries = Object.entries(source).slice(0, 50);
  const templates = {};

  for (const [fallbackKey, raw] of entries) {
    const template = normalizeTemplate(raw, fallbackKey);
    if (template) templates[template.key] = template;
  }

  return Object.keys(templates).length ? templates : DEFAULT_TEMPLATES;
}

async function getTemplates(env) {
  const kv = env.CALENDAR_KV || env.DROPS_KV;
  if (!kv) return DEFAULT_TEMPLATES;
  const saved = await kv.get(EVENT_TEMPLATES_KEY);
  if (!saved) return DEFAULT_TEMPLATES;

  try {
    return normalizeTemplates(JSON.parse(saved));
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

export async function onRequestGet({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ error: "Staff access required." }, { status: 403 });
  }

  const templates = await getTemplates(env);
  return Response.json({ success: true, templates });
}

export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ error: "Staff access required." }, { status: 403 });
  }

  const kv = env.CALENDAR_KV || env.DROPS_KV;
  if (!kv) {
    return Response.json({ error: "Calendar KV is not configured." }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const templates = normalizeTemplates(body.templates);

  await kv.put(EVENT_TEMPLATES_KEY, JSON.stringify(templates));

  return Response.json({ success: true, templates });
}
