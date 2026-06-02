export async function onRequestGet({ env }) {
  const token = env.DISCORD_BOT_TOKEN;
  const guildId = env.DISCORD_GUILD_ID;

  if (!token || !guildId) {
    return Response.json(
      { error: "Missing Discord bot token or guild ID." },
      { status: 500 }
    );
  }

  const response = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}?with_counts=true`,
    {
      headers: {
        Authorization: `Bot ${token}`
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    return Response.json(
      {
        error: "Could not load Discord stats.",
        status: response.status,
        details: data
      },
      { status: 500 }
    );
  }

  return Response.json({
    members: data.approximate_member_count || data.member_count || 0,
    online: data.approximate_presence_count || 0,
    name: data.name || "Ironkin"
  });
}
