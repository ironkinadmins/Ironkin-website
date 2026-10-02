import { getSupabaseKey, supabaseRest } from "../_supabase.js";
import { hybridKv } from "../../_hybridKv.js";

export const PROOF_BUCKET = "hall-of-flame-proofs";
const MEDALS = ["🥇", "🥈", "🥉"];
const DISCORD_SETTINGS_KEY = "hall-of-flame:discord-settings";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function discordFetch(url, options = {}, { maxRetries = 4 } = {}) {
  let attempt = 0;
  while (true) {
    const response = await fetch(url, options);
    if (response.status !== 429) return response;

    if (attempt >= maxRetries) return response;
    attempt += 1;

    let retryAfterMs = 1000;
    try {
      const data = await response.clone().json();
      if (Number.isFinite(Number(data?.retry_after))) retryAfterMs = Math.ceil(Number(data.retry_after) * 1000);
    } catch {}
    const headerDelay = Number(response.headers.get("Retry-After") || response.headers.get("X-RateLimit-Reset-After"));
    if (Number.isFinite(headerDelay) && headerDelay > 0) retryAfterMs = Math.max(retryAfterMs, Math.ceil(headerDelay * 1000));
    await sleep(Math.min(Math.max(retryAfterMs, 250), 15000));
  }
}

export async function getHallOfFlameDiscordSettings(env) {
  let saved = {};
  try {
    const raw = await hybridKv(env, "drops")?.get(DISCORD_SETTINGS_KEY);
    if (raw) saved = JSON.parse(raw) || {};
  } catch {}
  return {
    channelId: String(saved.channelId || env.HALL_OF_FLAME_CHANNEL_ID || "").trim(),
    channelName: String(saved.channelName || "").trim(),
    reviewChannelId: String(saved.reviewChannelId || "").trim(),
    reviewChannelName: String(saved.reviewChannelName || "").trim(),
    pingRoleId: String(saved.pingRoleId || "").trim(),
    pingRoleName: String(saved.pingRoleName || "").trim(),
    source: saved.channelId ? "site" : (env.HALL_OF_FLAME_CHANNEL_ID ? "cloudflare" : "none")
  };
}

export async function saveHallOfFlameDiscordSettings(env, settings) {
  const value = {
    channelId: String(settings?.channelId || "").trim(),
    channelName: String(settings?.channelName || "").trim(),
    reviewChannelId: String(settings?.reviewChannelId || "").trim(),
    reviewChannelName: String(settings?.reviewChannelName || "").trim(),
    pingRoleId: String(settings?.pingRoleId || "").trim(),
    pingRoleName: String(settings?.pingRoleName || "").trim(),
    updatedAt: new Date().toISOString()
  };
  if (!value.channelId) throw new Error("A Discord channel is required.");
  await hybridKv(env, "drops").put(DISCORD_SETTINGS_KEY, JSON.stringify(value));
  return value;
}


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
    // Older Discord boards used MM:SS:cc (hundredths), e.g. 1:10:00.
    // Normalize that legacy display format before using the standard parser.
    const legacyParts = timeMatch[1].replace(/,/g, ".").split(":");
    const legacyValue = legacyParts.length === 3 && /^\d{1,2}$/.test(legacyParts[2])
      ? `${legacyParts[0]}:${legacyParts[1]}.${legacyParts[2]}`
      : timeMatch[1];
    const timeMs = parseTimeToMs(legacyValue);
    if (!timeMs) return [];
    return [{ player: clean.slice(0, timeMatch.index).replace(/[-–—]\s*$/, "").trim(), timeMs, time: formatTime(timeMs), proofUrl }];
  }).sort((a,b) => a.timeMs - b.timeMs).slice(0, 3);
}

export async function discordMessages(env) {
  const token = env.DISCORD_BOT_TOKEN;
  const { channelId } = await getHallOfFlameDiscordSettings(env);
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

export async function syncDiscordBoard(env, boss, board, proofUrl = "", imageUrl = "") {
  const { channelId } = await getHallOfFlameDiscordSettings(env);
  if (!env.DISCORD_BOT_TOKEN || !channelId) throw new Error("Discord Hall of Flame integration is not configured.");
  const message = await bossMessage(env, boss);
  const existing = message?.embeds?.[0] || {};
  const description = board.map((row, i) => {
    const label = `${row.player} ${formatTime(row.timeMs)}`;
    return `${MEDALS[i]} • ${row.proofUrl ? `[${label}](${row.proofUrl})` : label}`;
  }).join("\n");
  const siteUrl = String(env.SITE_URL || "https://ironkinclan.com").replace(/\/+$/, "");
  const hallUrl = `${siteUrl}/hall-of-flame`;
  const embed = { ...existing, title: boss, description, url: hallUrl };
  // Public Hall of Flame boards use the managed Wiki artwork as a full-width
  // image beneath the Top 3, matching the visual treatment of the website cards.
  // Do not use the boss artwork as a thumbnail.
  delete embed.thumbnail;
  if (imageUrl) embed.image = { url:imageUrl };
  else delete embed.image;
  const headers={ Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type":"application/json" };
  if (!message) {
    const createdResponse = await discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, { method:"POST", headers, body:JSON.stringify({ embeds:[embed] }) });
    if (!createdResponse.ok) throw new Error(`Discord Hall of Flame create failed: ${await createdResponse.text()}`);
    const created = await createdResponse.json();
    return { synced:true, messageId:created.id, mode:"created" };
  }
  let response = await discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages/${message.id}`, { method:"PATCH", headers, body:JSON.stringify({ embeds:[embed] }) });
  if (response.ok) return { synced:true, messageId:message.id, mode:"edited" };
  // Legacy Hall of Flame embeds may have been authored by a webhook or older bot.
  // Discord only allows a bot to edit its own messages, so create a new managed
  // embed if the legacy message cannot be edited. Future updates will find the
  // newest matching boss title and edit that managed message instead.
  if (response.status === 403 || response.status === 404) {
    response = await discordFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, { method:"POST", headers, body:JSON.stringify({ embeds:[embed] }) });
    if (response.ok) { const created=await response.json(); return { synced:true, messageId:created.id, mode:"created" }; }
  }
  throw new Error(`Discord Hall of Flame update failed: ${await response.text()}`);
}


export async function updateHallOfFlameReviewNotification(env, submission, outcome = {}) {
  const token = String(env.DISCORD_BOT_TOKEN || "").trim();
  const channelId = String(submission?.review_discord_channel_id || "").trim();
  const messageId = String(submission?.review_discord_message_id || "").trim();
  if (!token || !channelId || !messageId) return { updated:false, reason:"Review message was not recorded" };

  const approved = outcome.status === "approved";
  const removed = outcome.status === "removed";
  const siteUrl = String(env.SITE_URL || "https://ironkinclan.com").replace(/\/+$/, "");
  const hallUrl = `${siteUrl}/hall-of-flame`;
  const reviewer = String(outcome.reviewedBy || submission.reviewed_by_name || "Ironkin staff").trim();
  const placement = Number(outcome.finalPlacement || submission.final_placement || 0);
  const title = approved ? "✅ PB Approved" : removed ? "🗑️ PB Removed" : "❌ PB Rejected";
  const color = approved ? 0x2ecc71 : removed ? 0x95a5a6 : 0xed4245;
  const resultText = approved
    ? (placement > 0 && placement <= 3 ? `🏆 **Ranked #${placement}** — this time is now live on the Hall of Flame.` : "Approved by staff.")
    : removed ? "This previously approved time was removed from the active leaderboard by staff."
    : "This submission was rejected by staff and was not added to the leaderboard.";
  const embed = {
    title,
    url: hallUrl,
    color,
    description: `${resultText}\n\n[Open Hall of Flame](${hallUrl})`,
    fields: [
      { name:"Boss", value:String(submission.boss || "Unknown"), inline:true },
      { name:"Player", value:String(submission.display_name || "Unknown"), inline:true },
      { name:"Time", value:formatTime(submission.time_ms), inline:true }
    ],
    footer:{ text:`${approved ? "Approved" : removed ? "Removed" : "Rejected"} by ${reviewer}` },
    timestamp:new Date().toISOString()
  };
  if (submission.proof_url) embed.image = { url:submission.proof_url };

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
    method:"PATCH",
    headers:{ Authorization:`Bot ${token}`, "Content-Type":"application/json" },
    body:JSON.stringify({ content:"", allowed_mentions:{ parse:[] }, embeds:[embed] })
  });
  if (!response.ok) return { updated:false, error:`Discord review update failed: ${await response.text()}` };
  return { updated:true, messageId };
}

export async function notifyHallOfFlameReview(env, submission) {
  const settings = await getHallOfFlameDiscordSettings(env);
  if (!env.DISCORD_BOT_TOKEN || !settings.reviewChannelId) return { sent:false, reason:"Review channel not configured" };
  const mention = settings.pingRoleId ? `<@&${settings.pingRoleId}>` : "";
  const siteUrl = String(env.SITE_URL || "https://ironkinclan.com").replace(/\/+$/, "");
  const hallUrl = `${siteUrl}/hall-of-flame#review`;
  const embed = {
    title: "🔥 New PB Awaiting Review",
    url: hallUrl,
    color: 16742144,
    description: `[Open Hall of Flame Review Queue](${hallUrl})`,
    fields: [
      { name:"Boss", value:String(submission.boss || "Unknown"), inline:true },
      { name:"Player", value:String(submission.display_name || "Unknown"), inline:true },
      { name:"Time", value:formatTime(submission.time_ms), inline:true },
      { name:"Projected", value:`#${Number(submission.projected_placement) || "—"}`, inline:true }
    ],
    footer:{ text:"Review and approve/reject this submission on ironkinclan.com" },
    timestamp:new Date().toISOString()
  };
  // Show the member's submitted proof directly in the review embed instead of
  // making Council open a separate screenshot link.
  if (submission.proof_url) embed.image = { url: submission.proof_url };
  const response = await fetch(`https://discord.com/api/v10/channels/${settings.reviewChannelId}/messages`, {
    method:"POST",
    headers:{ Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type":"application/json" },
    body:JSON.stringify({ content:mention, allowed_mentions:{ roles:settings.pingRoleId?[settings.pingRoleId]:[] }, embeds:[embed] })
  });
  if (!response.ok) throw new Error(`Discord review notification failed: ${await response.text()}`);
  const sent = await response.json();
  return { sent:true, messageId:sent.id, channelId:settings.reviewChannelId };
}
