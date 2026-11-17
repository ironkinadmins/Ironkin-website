import { getHallOfFlameDiscordSettings } from './api/hall-of-flame/_records.js';

// Keep the two historical boards after all individual PB boards. Only move
// messages authored by our bot; never delete a legacy/webhook record.
export async function ensureHistoricalRecordsLast(env) {
  const { channelId } = await getHallOfFlameDiscordSettings(env);
  const token = env.DISCORD_BOT_TOKEN;
  if (!channelId || !token) return { skipped: true, reason: 'Discord not configured' };
  const base = `https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`;
  const request = async (url, method = 'GET', payload) => {
    const response = await fetch(url, { method, headers: { Authorization: `Bot ${token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Discord ${response.status}: ${result.message || 'request failed'}`);
    return result;
  };
  const [messages, bot] = await Promise.all([request(`${base}?limit=100`), request('https://discord.com/api/v10/users/@me')]);
  const titles = ['Ironkin BOTW Records', 'Ironkin SOTW Records'];
  const matches = titles.map(title => messages.find(m => m.author?.id === bot.id && m.embeds?.some(e => e.title === title)));
  if (matches.some(m => !m)) return { skipped: true, reason: 'Both historical boards must be published first' };
  // Discord returns newest first; desired final ordering is BOTW then SOTW.
  if (messages[0]?.id === matches[1].id && messages[1]?.id === matches[0].id) return { moved: false };
  const created = [];
  for (const old of matches) {
    const payload = { content: old.content || '', embeds: old.embeds, allowed_mentions: { parse: [] } };
    const next = await request(base, 'POST', payload);
    created.push({ old: old.id, next: next.id });
  }
  // Remove originals only after both replacements exist.
  for (const entry of created) await request(`${base}/${entry.old}`, 'DELETE');
  return { moved: true, messageIds: created.map(x => x.next) };
}
