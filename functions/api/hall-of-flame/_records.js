import { getSupabaseKey, supabaseRest } from "../_supabase.js";

export const PROOF_BUCKET = "hall-of-flame-proofs";
const MEDALS = ["🥇", "🥈", "🥉"];

export function displayName(session) {
  return String(session?.nick || session?.global_name || session?.username || "Ironkin member").trim();
}

export function normalizeBoss(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);
}

export function parseTimeToMs(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return null;
  const normalized = raw.replace(/,/g, ".");
  const parts = normalized.split(":");
  if (parts.length > 3 || parts.some(part => !/^\d+(?:\.\d+)?$/.test(part))) return null;
  let seconds = 0;
  if (parts.length === 3) seconds = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  else if (parts.length === 2) seconds = Number(parts[0]) * 60 + Number(parts[1]);
  else seconds = Number(parts[0]);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 24 * 3600) return null;
  return Math.round(seconds * 1000);
}

export function formatTime(ms) {
  const total = Math.max(0, Number(ms) || 0);
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const hundredths = Math.floor((total % 1000) / 10);
  const sec = `${seconds}`.padStart(2, "0");
  const frac = hundredths ? `.${`${hundredths}`.padStart(2, "0")}` : "";
  if (hours) return `${hours}:${`${minutes}`.padStart(2, "0")}:${sec}${frac}`;
  return `${minutes}:${sec}${frac}`;
}

function firstUrl(text) {
  return String(text || "").match(/https?:\/\/[^\s)>]+/i)?.[0] || "";
}

export function parseDiscordBoard(description) {
  return String(description || "").split("\n").map(x => x.trim()).filter(Boolean).flatMap(line => {
    const m = line.match(/^(🥇|🥈|🥉)\s*•?\s*(.+)$/);
    if (!m) return [];
    const proofUrl = firstUrl(m[2]);
    const clean = m[2].replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/\s+-\s*$/g, "").trim();
    const timeMatch = clean.match(/(\d+(?::\d+){0,2}(?:[.,]\d+)?)\s*$/);
    if (!timeMatch) return [];
    const timeMs = parseTimeToMs(timeMatch[1]);
    if (!timeMs) return [];
    return [{ player: clean.slice(0, timeMatch.index).replace(/[-–—]\s*$/, "").trim(), timeMs, time: formatTime(timeMs), proofUrl }];
  }).sort((a,b) => a.timeMs - b.timeMs).slice(0, 3);
}

export async function discordMessages(env) {
  const token = env.DISCORD_BOT_TOKEN;
  const channelId = env.HALL_OF_FLAME_CHANNEL_ID;
  if (!token || !channelId) throw new Error("Discord Hall of Flame integration is not configured.");
  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=100`, { headers: { Authorization: `Bot ${token}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || "Could not load Hall of Flame Discord messages.");
  return data;
}

export async function bossMessage(env, boss) {
  const wanted = normalizeBoss(boss).toLowerCase();
  const messages = await discordMessages(env);
  return messages.find(message => normalizeBoss(message.embeds?.[0]?.title).toLowerCase() === wanted) || null;
}

export function projectedPlacement(board, timeMs) {
  const sorted = [...board, { timeMs, candidate: true }].sort((a,b) => a.timeMs - b.timeMs);
  return sorted.findIndex(row => row.candidate) + 1;
}

export async function uploadProof(env, file, submissionId) {
  const base = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = getSupabaseKey(env);
  if (!base || !key) throw new Error("Supabase is not configured.");
  const ext = String(file.name || "proof.png").split(".").pop().replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
  const path = `${submissionId}.${ext}`;
  const headers = { apikey: key, "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`${base}/storage/v1/object/${PROOF_BUCKET}/${path}`, { method: "POST", headers, body: file });
  if (!response.ok) throw new Error(`Proof upload failed: ${await response.text()}`);
  return `${base}/storage/v1/object/public/${PROOF_BUCKET}/${path}`;
}

export async function getSubmission(env, id) {
  const response = await supabaseRest(env, `hall_of_flame_submissions?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  return (await response.json())?.[0] || null;
}

export async function approvedForBoss(env, boss) {
  const response = await supabaseRest(env, `hall_of_flame_submissions?select=*&boss=eq.${encodeURIComponent(boss)}&status=eq.approved&order=time_ms.asc&limit=1000`);
  return response.json();
}

export function mergeBoard(legacy, approved) {
  const rows = [...legacy.map(row => ({...row, source:"legacy"})), ...approved.map(row => ({ player: row.display_name, timeMs: Number(row.time_ms), time: formatTime(row.time_ms), proofUrl: row.proof_url, source:"verified", submissionId: row.id }))];
  const best = new Map();
  for (const row of rows.sort((a,b) => a.timeMs-b.timeMs)) {
    const key = String(row.player || "").trim().toLowerCase();
    if (key && !best.has(key)) best.set(key, row);
  }
  return [...best.values()].sort((a,b) => a.timeMs-b.timeMs).slice(0,3);
}

export async function syncDiscordBoard(env, boss, board, proofUrl = "") {
  const message = await bossMessage(env, boss);
  const existing = message?.embeds?.[0] || {};
  const description = board.map((row, i) => `${MEDALS[i]} • ${row.player} ${formatTime(row.timeMs)}${row.proofUrl ? ` - ${row.proofUrl}` : ""}`).join("\n");
  const embed = { ...existing, title: boss, description };
  if (proofUrl) embed.url = proofUrl;
  const headers={ Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type":"application/json" };
  if (!message) {
    const createdResponse = await fetch(`https://discord.com/api/v10/channels/${env.HALL_OF_FLAME_CHANNEL_ID}/messages`, { method:"POST", headers, body:JSON.stringify({ embeds:[embed] }) });
    if (!createdResponse.ok) throw new Error(`Discord Hall of Flame create failed: ${await createdResponse.text()}`);
    const created = await createdResponse.json();
    return { synced:true, messageId:created.id, mode:"created" };
  }
  let response = await fetch(`https://discord.com/api/v10/channels/${env.HALL_OF_FLAME_CHANNEL_ID}/messages/${message.id}`, { method:"PATCH", headers, body:JSON.stringify({ embeds:[embed] }) });
  if (response.ok) return { synced:true, messageId:message.id, mode:"edited" };
  // Legacy Hall of Flame embeds may have been authored by a webhook or older bot.
  // Discord only allows a bot to edit its own messages, so create a new managed
  // embed if the legacy message cannot be edited. Future updates will find the
  // newest matching boss title and edit that managed message instead.
  if (response.status === 403 || response.status === 404) {
    response = await fetch(`https://discord.com/api/v10/channels/${env.HALL_OF_FLAME_CHANNEL_ID}/messages`, { method:"POST", headers, body:JSON.stringify({ embeds:[embed] }) });
    if (response.ok) { const created=await response.json(); return { synced:true, messageId:created.id, mode:"created" }; }
  }
  throw new Error(`Discord Hall of Flame update failed: ${await response.text()}`);
}
