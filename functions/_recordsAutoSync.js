import { curatedChampions } from './_curatedChampions.js';
import { getHallOfFlameDiscordSettings } from './api/hall-of-flame/_records.js';

const tidy = value => String(value ?? '').trim();
const metric = value => tidy(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const titleFor = entry => {
  const text = tidy(entry.metric || entry.title || entry.label);
  return text.replace(/^skill of the week\s*[-–:]\s*/i, '').replace(/^boss of the week\s*[-–:]\s*/i, '') || 'Event';
};
export function buildSyncedRecords(archive) {
  const sets = { sotw: [], botw: [] };
  for (const type of ['sotw','botw']) {
    const seen = new Set();
    const add = row => {
      const id = `${metric(row.eventName)}|${metric(row.winner)}`;
      if (!row.eventName || !row.winner || !row.score || seen.has(id)) return;
      seen.add(id); sets[type].push(row);
    };
    for (const entry of archive || []) {
      if (entry?.type !== type || !entry?.winner?.name) continue;
      const id = String(entry.womCompetitionId || entry.womCompetitionIds?.[0] || '').trim();
      add({ eventName: titleFor(entry), winner: tidy(entry.winner.name), score: `${Number(entry.winner.gained || 0).toLocaleString('en-US')} ${type === 'sotw' ? 'XP' : 'KC'}`, url: /^\d+$/.test(id) ? `https://wiseoldman.net/competitions/${id}` : '' });
    }
    for (const row of curatedChampions[type] || []) add(row);
  }
  return sets;
}
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
export async function syncRecordEmbeds(env,archive,types=['sotw','botw']) {
  const {channelId}=await getHallOfFlameDiscordSettings(env);
  const token=env.DISCORD_BOT_TOKEN;
  if(!channelId||!token) throw new Error('Hall of Flame Discord bot/channel not configured.');
  const base=`https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`;
  const [messages,bot]=await Promise.all([discord(`${base}?limit=100`,token),discord('https://discord.com/api/v10/users/@me',token)]);
  const records=buildSyncedRecords(archive), results=[];
  for (const type of types) {
    const title=type==='sotw'?'Ironkin SOTW Records':'Ironkin BOTW Records';
    const previous=messages.find(m=>m.author?.id===bot.id&&m.embeds?.some(e=>e.title===title));
    const payload={embeds:embedChunks(type,records[type]),allowed_mentions:{parse:[]}};
    const message=await discord(previous?`${base}/${previous.id}`:base,token,previous?'PATCH':'POST',payload);
    results.push({type,action:previous?'updated':'created',messageId:message.id,count:records[type].length});
  }
  return results;
}
