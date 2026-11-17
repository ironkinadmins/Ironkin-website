import { hybridKv } from '../../../_hybridKv.js';
import { getSession, isStaffSession } from '../../_auth.js';
import { reconcileHistoricalRecords, syncRecordEmbeds } from '../../../_recordsAutoSync.js';
import { getHallOfFlameDiscordSettings } from '../../hall-of-flame/_records.js';

// Preview archive coverage without modifying Discord or archived results.
export async function onRequestGet({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) return Response.json({ error: 'Staff only.' }, { status: 403 });
  try {
    const raw = await hybridKv(env, 'drops').get('events:archive');
    const archive = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(archive)) throw new Error('Archive is invalid.');
    const { records, issues, counts } = reconcileHistoricalRecords(archive);
    const { channelId } = await getHallOfFlameDiscordSettings(env);
    const discord = { checked: false, missing: [], extra: [] };
    if (channelId && env.DISCORD_BOT_TOKEN) {
      const response = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages?limit=100`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
      if (response.ok) {
        const messages = await response.json();
        discord.checked = true;
        for (const type of ['botw','sotw']) {
          const title = `Ironkin ${type.toUpperCase()} Records`;
          const message = messages.find(m => m.embeds?.some(e => e.title === title));
          const actual = new Set();
          for (const embed of message?.embeds || []) {
            for (const line of String(embed.description || '').split('\n')) {
              const match = line.match(/^\d+\.\s+\*\*(.+?)\*\*\s+[—–-]\s+(.+?)\s+[·•]\s+/);
              if (match) actual.add(`${match[1].toLowerCase().replace(/[^a-z0-9]/g,'')}|${match[2].toLowerCase().replace(/[^a-z0-9]/g,'')}`);
            }
          }
          const expected = new Set(records[type].map(r => `${r.eventName.toLowerCase().replace(/[^a-z0-9]/g,'')}|${r.winner.toLowerCase().replace(/[^a-z0-9]/g,'')}`));
          for (const r of records[type]) {
            const key = `${r.eventName.toLowerCase().replace(/[^a-z0-9]/g,'')}|${r.winner.toLowerCase().replace(/[^a-z0-9]/g,'')}`;
            if (!actual.has(key)) discord.missing.push({ type, eventName: r.eventName, winner: r.winner });
          }
          for (const key of actual) if (!expected.has(key)) discord.extra.push({ type, recordKey: key });
        }
      } else discord.error = `Discord comparison unavailable (HTTP ${response.status})`;
    } else discord.error = 'Discord integration is not configured';
    return Response.json({ counts, issues, records, discord }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
// Admin recovery action for missed Discord updates. Never changes archived results.
export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) return Response.json({ error: 'Staff only.' }, { status: 403 });
  try {
    const raw = await hybridKv(env, 'drops').get('events:archive');
    const archive = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(archive)) throw new Error('Archive is invalid.');
    const results = await syncRecordEmbeds(env, archive);
    return Response.json({ success: true, results }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ success: false, error: String(error?.message || error) }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
