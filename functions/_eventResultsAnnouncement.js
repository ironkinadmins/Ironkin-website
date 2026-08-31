import { getWomCompetitionSnapshot, normalizeWomStandingsRows } from "./_womCompetition.js";
import { readDropsWithClanGoalFallback } from "./api/drops/_dropKeys.js";
import { hasSupabase, supabaseRest } from "./api/_supabase.js";

const DISCORD_API = "https://discord.com/api/v10";
const MAX_CONTENT = 1950;

function text(value) { return String(value ?? "").trim(); }
function number(value) { return Number(value || 0); }
function formatNumber(value) { return Math.max(0, number(value)).toLocaleString("en-US"); }
function isBounties(event) { return event?.type === "bounties" || event?.id === "bounties"; }
function isClanGoal(event) { return String(event?.type || "").includes("clan-goal"); }
function hasWom(event) {
  const id = text(event?.womCompetitionId);
  return Boolean(id && id !== "PUT_YOUR_WOM_ID_HERE");
}

function metricLabel(entry) {
  const metric = text(entry?.metric).toLowerCase();
  if (metric.includes("kill") || metric.includes("boss") || entry?.type === "botw") return "KC";
  return "XP";
}

function titleCaseMetric(value) {
  return text(value).replace(/[_-]+/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

function eventName(entry) {
  const metric = titleCaseMetric(entry?.metric);
  if (entry?.type === "sotw") return `Skill of the Week — ${metric || text(entry.title) || "Final"} Results`;
  if (entry?.type === "botw") return `Boss of the Week — ${metric || text(entry.title) || "Final"} Results`;
  if (isClanGoal(entry)) return `${text(entry.title) || "Clan Goal"} — Results`;
  if (isBounties(entry)) return `${text(entry.title) || "Clan Bounties"} — Results`;
  return `${text(entry.title) || text(entry.label) || "Event"} — Results`;
}

function rewardForRank(entry, index) {
  const reward = entry?.rewards?.placement?.[index];
  return text(reward?.reward);
}

function topRows(entry, count = 3) {
  const rows = Array.isArray(entry?.leaderboard) ? entry.leaderboard : [];
  return rows.filter(row => number(row?.gained) > 0).slice(0, count);
}

function placementLine(entry, row, index) {
  const medals = ["🥇", "🥈", "🥉"];
  const reward = rewardForRank(entry, index);
  const metric = metricLabel(entry);
  return `${medals[index] || "•"} **${text(row?.name) || "Clan member"}** — ${formatNumber(row?.gained)} ${metric}${reward ? `\n↳ ${reward}` : ""}`;
}

function reachedMilestones(entry) {
  const target = number(entry?.target);
  if (!target) return [];
  const progress = number(entry?.totalGained);
  const percent = Math.max(0, (progress / target) * 100);
  return (Array.isArray(entry?.milestones) ? entry.milestones : [])
    .filter(item => number(item?.percent) <= percent)
    .sort((a, b) => number(a?.percent) - number(b?.percent));
}

function buildWomContent(entry) {
  const metric = metricLabel(entry);
  const leaders = topRows(entry, 3);
  const participantCount = number(entry?.participantCount || entry?.contributors);
  const participantWord = participantCount === 1 ? "participant" : "participants";
  const label = entry?.type === "botw" ? "Total KC Gained" : "Total XP Gained";
  const intro = entry?.type === "botw"
    ? "Another Boss of the Week is in the books. The kills are counted, the leaderboard is locked, and the final results are here."
    : "Another Skill of the Week is complete. Every gain counted, the leaderboard is locked, and the final results are here.";

  const lines = [
    `# ${entry?.type === "botw" ? "⚔️" : "🏆"} ${eventName(entry)}`,
    "",
    `*${intro} Outstanding work to everyone who took part.*`,
    "",
    "**Event Recap**",
    `👥 ${formatNumber(participantCount)} ${participantWord}`,
    `📈 ${label}: **${formatNumber(entry?.totalGained)} ${metric}**`,
    "",
    `**${entry?.type === "botw" ? "Top Hunters" : "Top Performers"}**`
  ];

  if (leaders.length) leaders.forEach((row, index) => lines.push("", placementLine(entry, row, index)));
  else lines.push("", "No positive gains were recorded in the final snapshot.");

  lines.push("", `*${entry?.type === "botw" ? "The hunt continues." : "The next grind awaits."}*`, "", "🔥 **Forged Alone. Bound as Kin.** 🔥");
  return lines.join("\n");
}

function buildClanGoalContent(entry) {
  const target = number(entry?.target);
  const gained = number(entry?.totalGained);
  const percent = target ? Math.min(999, (gained / target) * 100) : 0;
  const leaders = topRows(entry, 3);
  const milestones = reachedMilestones(entry);
  const lines = [
    `# 🎯 ${eventName(entry)}`,
    "",
    `*The clan goal has officially closed. The final numbers are locked and every contribution helped move Ironkin forward.*`,
    "",
    "**Final Progress**",
    `📊 **${formatNumber(gained)}${target ? ` / ${formatNumber(target)}` : ""}**${target ? ` — ${percent.toFixed(1)}%` : ""}`,
    `👥 ${formatNumber(entry?.contributors)} contributors`
  ];

  if (leaders.length) {
    lines.push("", "**Top Contributors**");
    leaders.forEach((row, index) => lines.push("", placementLine(entry, row, index)));
  }
  if (milestones.length) {
    lines.push("", "**Milestones Reached**");
    milestones.forEach(item => lines.push(`✅ ${formatNumber(item.percent)}% — ${text(item.title) || "Milestone complete"}`));
  }
  lines.push("", target && gained >= target ? "🏁 **Clan Goal Complete.** Incredible work, Ironkin." : "The goal has closed, but every contribution added to the clan's progress.", "", "🔥 **Forged Alone. Bound as Kin.** 🔥");
  return lines.join("\n");
}

function buildBountyContent(entry) {
  const stats = entry?.bountyStats || {};
  const hunters = Array.isArray(stats.topHunters) ? stats.topHunters.slice(0, 3) : [];
  const lines = [
    `# 🎯 ${eventName(entry)}`,
    "",
    "*The bounty board is closed and the final claims are in. Another hunt is complete.*",
    "",
    "**Bounty Recap**",
    `🎯 Completed Claims: **${formatNumber(stats.totalClaims)}**`,
    `👥 Unique Hunters: **${formatNumber(stats.uniqueHunters)}**`,
    `🔥 Embers Earned: **${formatNumber(stats.totalEmbers)}**`
  ];
  if (hunters.length) {
    lines.push("", "**Top Bounty Hunters**");
    hunters.forEach((hunter, index) => {
      const medals = ["🥇", "🥈", "🥉"];
      lines.push("", `${medals[index]} **${text(hunter.playerName) || "Clan member"}** — ${formatNumber(hunter.totalClaims)} claims · ${formatNumber(hunter.uniqueBounties)} unique · ${formatNumber(hunter.embers)} Embers`);
    });
  }
  lines.push("", "*The board will return with new targets.*", "", "🔥 **Forged Alone. Bound as Kin.** 🔥");
  return lines.join("\n");
}

export function buildEventResultsContent(entry) {
  const content = isBounties(entry) ? buildBountyContent(entry) : isClanGoal(entry) ? buildClanGoalContent(entry) : buildWomContent(entry);
  return content.length <= MAX_CONTENT ? content : `${content.slice(0, MAX_CONTENT - 2).trimEnd()}…`;
}

async function loadBountyStats(env, eventId, drops) {
  if (!hasSupabase(env)) return { totalClaims: 0, uniqueHunters: 0, totalEmbers: 0, topHunters: [] };
  const response = await supabaseRest(env, `ironkin_event_submissions?select=item_id,item_name,quantity,player_name,player_key,discord_id&website_event_id=eq.${encodeURIComponent(eventId)}&status=eq.approved&limit=5000`);
  const rows = await response.json();
  const rewards = new Map((drops || []).map(drop => [`${Number(drop?.itemId || 0)}:${text(drop?.name).toLowerCase()}`, Math.max(0, number(drop?.rewardEmbers))]));
  const hunterMap = new Map();
  let totalClaims = 0;
  let totalEmbers = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const qty = Math.max(0, number(row?.quantity));
    if (!qty) continue;
    const key = `${Number(row?.item_id || 0)}:${text(row?.item_name).toLowerCase()}`;
    const reward = number(rewards.get(key));
    totalClaims += qty;
    totalEmbers += qty * reward;
    const hunterKey = text(row?.discord_id || row?.player_key || row?.player_name).toLowerCase();
    if (!hunterKey) continue;
    const hunter = hunterMap.get(hunterKey) || { playerName: text(row?.player_name) || "Clan member", totalClaims: 0, unique: new Set(), embers: 0 };
    hunter.totalClaims += qty;
    hunter.unique.add(key);
    hunter.embers += qty * reward;
    hunterMap.set(hunterKey, hunter);
  }
  const topHunters = [...hunterMap.values()].map(h => ({ playerName: h.playerName, totalClaims: h.totalClaims, uniqueBounties: h.unique.size, embers: h.embers }))
    .sort((a, b) => b.uniqueBounties - a.uniqueBounties || b.totalClaims - a.totalClaims || b.embers - a.embers || a.playerName.localeCompare(b.playerName));
  return { totalClaims, uniqueHunters: hunterMap.size, totalEmbers, topHunters };
}

export async function buildEventResultsSnapshot(env, event) {
  let standings = null;
  if (hasWom(event)) standings = await getWomCompetitionSnapshot(env, event.womCompetitionId);
  const dropsResult = await readDropsWithClanGoalFallback(env, event, { isClanGoal: isClanGoal(event) });
  const drops = dropsResult.drops || [];
  const sourceRows = standings?.standings?.length ? standings.standings : (Array.isArray(event?.leaderboard) ? event.leaderboard : []);
  const leaderboard = normalizeWomStandingsRows(sourceRows);
  const positive = leaderboard.filter(row => number(row?.gained) > 0);
  const snapshot = {
    ...event,
    title: standings?.title || event?.title,
    metric: standings?.metric || event?.metric || null,
    startDate: standings?.startsAt || event?.startDate || null,
    endDate: standings?.endsAt || event?.endDate || null,
    totalGained: number(standings?.totalGained ?? event?.totalGained),
    contributors: number(standings?.contributors ?? event?.contributors),
    participantCount: number(standings?.participantCount ?? event?.participantCount ?? leaderboard.length),
    leaderboard,
    topFive: positive.slice(0, 5),
    winner: positive[0] || event?.winner || null,
    drops
  };
  if (isBounties(event)) snapshot.bountyStats = await loadBountyStats(env, String(event.id || "bounties"), drops);
  return snapshot;
}

export function getResultsChannelId(env, event) {
  return text(event?.resultsAnnouncement?.channelId || env.EVENT_RESULTS_CHANNEL_ID || env.RESULTS_CHANNEL_ID);
}

export async function postEventResultsToDiscord(env, entry, contentOverride = null) {
  const channelId = getResultsChannelId(env, entry);
  if (!env.DISCORD_BOT_TOKEN) throw new Error("DISCORD_BOT_TOKEN is not configured.");
  if (!channelId) throw new Error("No results channel is configured. Add a channel ID in Results Publishing or set EVENT_RESULTS_CHANNEL_ID.");
  const savedContent = text(entry?.resultsAnnouncement?.content);
  const content = text(contentOverride) || savedContent || buildEventResultsContent(entry);
  if (!content) throw new Error("The results post is empty.");
  if (content.length > MAX_CONTENT) throw new Error(`The results post is too long (${content.length}/${MAX_CONTENT} characters).`);
  const response = await fetch(`${DISCORD_API}/channels/${encodeURIComponent(channelId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || `Discord rejected the results post (${response.status}).`);
  return { channelId, messageId: text(data?.id), postedAt: new Date().toISOString(), content };
}
