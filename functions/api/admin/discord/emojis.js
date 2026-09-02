import { getSession, isStaffSession } from "../../_auth.js";

export async function onRequestGet({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) {
    return Response.json({ error: "Discord bot or guild is not configured." }, { status: 503 });
  }

  const response = await fetch(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/emojis`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return Response.json({ error: data?.message || `Discord returned ${response.status}.` }, { status: 502 });
  }

  const emojis = (Array.isArray(data) ? data : [])
    .filter(emoji => emoji?.id && emoji?.name && emoji?.available !== false)
    .map(emoji => ({
      id: String(emoji.id),
      name: String(emoji.name),
      animated: Boolean(emoji.animated),
      code: `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`,
      url: `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? "gif" : "webp"}?size=64&quality=lossless`
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return Response.json({ emojis }, { headers: { "Cache-Control": "private, max-age=300" } });
}
