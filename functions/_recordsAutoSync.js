import { curatedChampions } from './_curatedChampions.js';
import { getHallOfFlameDiscordSettings } from './api/hall-of-flame/_records.js';

const tidy = value => String(value ?? '').trim();
const metric = value => tidy(value).toLowerCase().replace(/[^a-z0-9]/g, '');
export const displayEventName = value => {
  const raw = tidy(value).replace(/_/g, ' ').replace(/\s+/g, ' ');
  const key = raw.toLowerCase().replace(/[’']/g, '');
  const known = {
    'phosanis nightmare': "Phosani's Nightmare",
    'phosani s nightmare': "Phosani's Nightmare",
    'barrows chests': 'Barrows Chests',
    'chambers of xeric': 'Chambers of Xeric',
    'theatre of blood': 'Theatre of Blood',
    'tombs of amascut': 'Tombs of Amascut',
    'royal titans': 'Royal Titans',
    'artio/callisto': 'Artio/Callisto'
  };
  return known[key] || raw.replace(/\b[a-z]/g, letter => letter.toUpperCase());
};
const titleFor = entry => {
  const raw = tidy(entry.metric || entry.title || entry.label);
  return displayEventName(raw.replace(/^skill of the week\s*[-–:]\s*/i, '').replace(/^boss of the week\s*[-–:]\s*/i, '') || 'Event');
};
// Only verified equivalent BOTW categories are merged. Preserve source archives.
const canonicalEventName = (type, value) => {
  const name = displayEventName(value);
  if (type !== 'botw') return name;
  const key = metric(name);
  if (key === 'barrows' || key === 'barrowschests') return 'Barrows';
  if (key === 'phosanisnightmare' || key === 'phosanisnightmarenightmare') return "Phosani's Nightmare";
  return name;
};
const numericScore = row => Number(String(row.score || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/)?.[0] || 0);
const preferRecord = (candidate, current) => {
  const a = numericScore(candidate), b = numericScore(current);
  if (a !== b) return a > b;
  if ((candidate.source === 'archive') !== (current.source === 'archive')) return candidate.source === 'archive';
  return false;
};
const archiveType = entry => {
  const type = tidy(entry?.type).toLowerCase();
  return type === 'sotw' ? 'sotw' : (type === 'botw' || type.startsWith('botw-') ? 'botw' : null);
};
const compareRecords = (a,b) => a.eventName.localeCompare(b.eventName, 'en', {sensitivity:'base'}) || a.winner.localeCompare(b.winner,'en',{sensitivity:'base'});

// Reconciliation is read-only. Invalid or incomplete archived results are
// reported instead of silently fabricating a winner or changing history.
export function reconcileHistoricalRecords(archive) {
  const sets = { sotw: [], botw: [] };
  const issues = [];
  const add = (type, row) => {
    const normalized = { ...row, eventName: canonicalEventName(type, row.eventName) };
    const key = metric(normalized.eventName);
    // A category has one record: the verified highest historical result.
    // Only merge equivalent event categories. Different bosses may share a
    // legacy WOM URL, so competition IDs alone must never trigger a merge.
    const existingIndex = sets[type].findIndex(item => metric(item.eventName) === key);
    if (existingIndex < 0) sets[type].push(normalized);
    else if (preferRecord(normalized, sets[type][existingIndex])) sets[type][existingIndex] = normalized;
  };
  for (const entry of archive || []) {
    const type = archiveType(entry);
    if (!type) continue;
    const eventName = titleFor(entry);
    const winner = tidy(entry?.winner?.name || entry?.winner?.rsn);
    const gained = Number(entry?.winner?.gained);
    const id = String(entry.womCompetitionId || entry.womCompetitionIds?.[0] || '').trim();
    if (!winner || !Number.isFinite(gained) || gained <= 0) {
      issues.push({ type, archiveId: String(entry.id || ''), eventName, reason: 'Missing winner or positive score', womCompetitionId: id });
      continue;
    }
    add(type, { eventName, winner, score: `${gained.toLocaleString('en-US')} ${type === 'sotw' ? 'XP' : 'KC'}`, url: /^\d+$/.test(id) ? `https://wiseoldman.net/competitions/${id}` : '', source: 'archive', archiveId: String(entry.id || '') });
  }
  for (const type of ['sotw','botw']) {
    for (const row of curatedChampions[type] || []) {
      if (!row.eventName || !row.winner || !row.score) continue;
      add(type, { ...row, source: 'legacy-curated' });
    }
    sets[type].sort(compareRecords);
  }
  return { records: sets, issues, counts: {sotw:sets.sotw.length,botw:sets.botw.length,archiveIssues:issues.length} };
}
export const buildSyncedRecords = archive => reconcileHistoricalRecords(archive).records;
const safe = value => tidy(value).replace(/([\\*_`~|>])/g, '\\$1').replace(/@/g, '＠');
const embedChunks = (type, rows) => {
  const title = type === 'sotw' ? 'Ironkin SOTW Records' : 'Ironkin BOTW Records';
  const chunks = []; let part = '';
  for (const [i,row] of rows.entries()) {
    const line = `${i+1}. **${safe(row.eventName)}** — ${safe(row.winner)} · ${safe(row.score)}${/^https:\/\/wiseoldman\.net\//.test(row.url || '') ? ` · [WOM](${row.url})` : ''}`;
    if ((part+'\n'+line).length > 3800) { chunks.push(part); part=''; }
    part += (part?'\n':'')+line;
  }
  if (part) chunks.push(part);
  if (!chunks.length) chunks.push('No recorded champions yet.');
  if (chunks.length > 10) throw new Error('Too many records for Discord embeds.');
  return chunks.map((description,i)=>({title:i?`${title} · Part ${i+1}`:title,description,color:type==='sotw'?0xE7A445:0xE87432,footer:{text:`Ironkin ${type.toUpperCase()} historical records · ${rows.length} winners · Automatically synced`}}));
};
async function discord(url,token,method='GET',payload) {
  const res=await fetch(url,{method,headers:{Authorization:`Bot ${token}`,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
  const body=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(`Discord ${res.status}: ${tidy(body.message).slice(0,140)}`);
  return body;
}
// Discord limits edits to messages older than an hour. Historical boards are
// immutable snapshots: skip identical snapshots, otherwise publish a replacement
// and only then remove the obsolete bot-owned board(s).
const historicalBoard = (message, title, botId) => message.author?.id === botId && message.embeds?.some(e => e.title === title);
const sameEmbeds = (a, b) => JSON.stringify((a || []).map(e => ({title:e.title,description:e.description,color:e.color,footer:e.footer?.text}))) === JSON.stringify((b || []).map(e => ({title:e.title,description:e.description,color:e.color,footer:e.footer?.text})));
const verifyBoard = (message, expected, type) => {
  const published = (message.embeds || []).flatMap(embed => String(embed.description || '').split('\n')).filter(line => /^\d+\.\s+\*\*/.test(line)).length;
  if (published !== expected) throw new Error(`Discord ${type.toUpperCase()} verification failed: expected ${expected}, published ${published}`);
  return published;
};
export async function syncRecordEmbeds(env,archive,types=['botw','sotw']) {
  const {channelId}=await getHallOfFlameDiscordSettings(env);
  const token=env.DISCORD_BOT_TOKEN;
  if(!channelId||!token) throw new Error('Hall of Flame Discord bot/channel not configured.');
  const base=`https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`;
  const [messages,bot]=await Promise.all([discord(`${base}?limit=100`,token),discord('https://discord.com/api/v10/users/@me',token)]);
  const reconciliation=reconcileHistoricalRecords(archive), records=reconciliation.records, results=[];
  for (const type of types) {
    const title=type==='sotw'?'Ironkin SOTW Records':'Ironkin BOTW Records';
    const matching=messages.filter(m=>historicalBoard(m,title,bot.id));
    const payload={embeds:embedChunks(type,records[type]),allowed_mentions:{parse:[]}};
    const identical=matching.find(m=>sameEmbeds(m.embeds,payload.embeds));
    if (identical) {
      const count=verifyBoard(identical,records[type].length,type);
      // Reconcile abandoned older copies from a previous partial attempt.
      for(const old of matching.filter(m=>m.id!==identical.id)) await discord(`${base}/${old.id}`,token,'DELETE');
      results.push({type,action:'unchanged',messageId:identical.id,count});
      continue;
    }
    // Never PATCH historical boards: Discord may reject edits to old messages
    // with a non-retryable 429. POST creates a fresh managed snapshot.
    const created=await discord(base,token,'POST',payload);
    const count=verifyBoard(created,records[type].length,type);
    // The new board is published and verified before old ones are removed.
    // If deletion fails, a subsequent run finds the identical new board and
    // finishes cleanup rather than creating another copy.
    for(const old of matching) await discord(`${base}/${old.id}`,token,'DELETE');
    results.push({type,action:matching.length?'replaced':'created',messageId:created.id,count});
  }
  return { results, reconciliation: { counts: reconciliation.counts, issues: reconciliation.issues } };
}
