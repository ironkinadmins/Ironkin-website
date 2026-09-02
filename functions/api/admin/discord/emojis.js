import { getSession, isStaffSession } from "../../_auth.js";

const discordHeaders = token => ({ Authorization: `Bot ${token}` });

async function fetchGuildEmojis(token, guild) {
  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guild.id}/emojis`, {
      headers: discordHeaders(token)
    });
    if (!response.ok) return { ...guild, emojis: [], unavailable: true };
    const data = await response.json().catch(() => []);
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
    return { ...guild, emojis };
  } catch {
    return { ...guild, emojis: [], unavailable: true };
  }
}

export async function onRequestGet({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) {
    return Response.json({ error: "Discord bot or guild is not configured." }, { status: 503 });
  }

  const token = env.DISCORD_BOT_TOKEN;
  const guildsResponse = await fetch("https://discord.com/api/v10/users/@me/guilds?limit=200", {
    headers: discordHeaders(token)
  });
  const guildsData = await guildsResponse.json().catch(() => null);
  if (!guildsResponse.ok || !Array.isArray(guildsData)) {
    return Response.json({ error: guildsData?.message || `Discord returned ${guildsResponse.status}.` }, { status: 502 });
  }

  const guilds = guildsData.map(guild => ({ id: String(guild.id), name: String(guild.name || "Discord Server") }));
  if (!guilds.some(guild => guild.id === String(env.DISCORD_GUILD_ID))) {
    guilds.unshift({ id: String(env.DISCORD_GUILD_ID), name: "Ironkin" });
  }

  const resolved = await Promise.all(guilds.map(guild => fetchGuildEmojis(token, guild)));
  const primaryGuild = resolved.find(guild => guild.id === String(env.DISCORD_GUILD_ID)) || {
    id: String(env.DISCORD_GUILD_ID), name: "Ironkin", emojis: []
  };
  const otherGuilds = resolved
    .filter(guild => guild.id !== String(env.DISCORD_GUILD_ID) && guild.emojis.length)
    .sort((a, b) => a.name.localeCompare(b.name));

  return Response.json({
    primaryGuild,
    otherGuilds,
    emojis: primaryGuild.emojis
  }, { headers: { "Cache-Control": "private, max-age=300" } });
}
