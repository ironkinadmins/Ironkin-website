export async function onRequestGet({ env }) {
  const token = env.DISCORD_BOT_TOKEN;
  const channelId = env.HALL_OF_FLAME_CHANNEL_ID;

  if (!token || !channelId) {
    return Response.json(
      { error: "Missing Discord token or channel ID." },
      { status: 500 }
    );
  }

  const response = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages?limit=25`,
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
        error: "Could not load Hall of Flame messages.",
        status: response.status,
        details: data
      },
      { status: 500 }
    );
  }

  const entries = data.map(message => {
    const embed = message.embeds?.[0];

    return {
      id: message.id,
      createdAt: message.timestamp,
      author: message.author?.username || "Discord",
      content: message.content || "",
      title: embed?.title || "",
      description: embed?.description || "",
      fields: embed?.fields || [],
      color: embed?.color || null
    };
  });

  return Response.json({ entries });
}