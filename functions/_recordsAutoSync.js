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
const recordKey = row => `${metric(row.eventName)}|${metric(row.winner)}`;
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
  const seen = { sotw: new Set(), botw: new Set() };
  const add = (type,row) => {
    const normalized = { ...row, eventName: displayEventName(row.eventName) };
    const key = recordKey(normalized);
    if (seen[type].has(key)) return;
    seen[type].add(key);
    sets[type].push(normalized);
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
export async function syncRecordEmbeds(env,archive,types=['botw','sotw']) {
  const {channelId}=await getHallOfFlameDiscordSettings(env);
  const token=env.DISCORD_BOT_TOKEN;
  if(!channelId||!token) throw new Error('Hall of Flame Discord bot/channel not configured.');
  const base=`https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`;
  const [messages,bot]=await Promise.all([discord(`${base}?limit=100`,token),discord('https://discord.com/api/v10/users/@me',token)]);
  const reconciliation=reconcileHistoricalRecords(archive), records=reconciliation.records, results=[];
  for (const type of types) {
    const title=type==='sotw'?'Ironkin SOTW Records':'Ironkin BOTW Records';
    const previous=messages.find(m=>m.author?.id===bot.id&&m.embeds?.some(e=>e.title===title));
    const payload={embeds:embedChunks(type,records[type]),allowed_mentions:{parse:[]}};
    const message=await discord(previous?`${base}/${previous.id}`:base,token,previous?'PATCH':'POST',payload);
    const published = (message.embeds || []).flatMap(embed => String(embed.description || '').split('\n')).filter(line => /^\d+\.\s+\*\*/.test(line)).length;
    if (published !== records[type].length) throw new Error(`Discord ${type.toUpperCase()} verification failed: expected ${records[type].length}, published ${published}`);
    results.push({type,action:previous?'updated':'created',messageId:message.id,count:published});
  }
  return { results, reconciliation: { counts: reconciliation.counts, issues: reconciliation.issues } };
}
