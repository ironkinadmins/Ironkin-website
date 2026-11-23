export async function activeGuildMember(env, discordId) {
  if(!env.DISCORD_BOT_TOKEN||!env.DISCORD_GUILD_ID||!discordId)return false;
  try {
    const response=await fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(env.DISCORD_GUILD_ID)}/members/${encodeURIComponent(discordId)}`,{headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`}});
    return response.status===200;
  } catch { return false; }
}
