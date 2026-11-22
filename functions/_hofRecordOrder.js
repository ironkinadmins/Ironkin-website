import { displayEventName } from './_recordsAutoSync.js';
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
  // Normalize legacy record names without touching winners, scores, or links.
  // Discord embeds use **event name** at the start of each numbered row.
  const normalizedEmbeds = message => (message.embeds || []).map(embed => ({
    ...embed,
    description: String(embed.description || '').replace(/(^|\n)(\d+\.\s+\*\*)([^*\n]+)(\*\*)/g,
      (_whole, prefix, number, eventName, closing) => `${prefix}${number}${displayEventName(eventName.trim())}${closing}`)
  }));
  const changed = matches.map(message => normalizedEmbeds(message).some((embed, i) => embed.description !== (message.embeds[i]?.description || '')));
  // Discord returns newest first; desired final ordering is BOTW then SOTW.
  // If already in position, edit in place instead of unnecessarily reposting.
  if (messages[0]?.id === matches[1].id && messages[1]?.id === matches[0].id) {
    for (let i = 0; i < matches.length; i++) {
      if (changed[i]) {
        const replacement = await request(base, 'POST', { content: matches[i].content || '', embeds: normalizedEmbeds(matches[i]), allowed_mentions: { parse: [] } });
        await request(`${base}/${matches[i].id}`, 'DELETE');
        return { moved: true, normalized: 1, messageIds: [replacement.id] };
      }
    }
    return { moved: false, normalized: changed.filter(Boolean).length };
  }
  const created = [];
  for (const old of matches) {
    const payload = { content: old.content || '', embeds: normalizedEmbeds(old), allowed_mentions: { parse: [] } };
    const next = await request(base, 'POST', payload);
    created.push({ old: old.id, next: next.id });
  }
  // Remove originals only after both replacements exist.
  for (const entry of created) await request(`${base}/${entry.old}`, 'DELETE');
  return { moved: true, normalized: changed.filter(Boolean).length, messageIds: created.map(x => x.next) };
}
