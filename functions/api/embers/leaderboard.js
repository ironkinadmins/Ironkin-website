export async function onRequestGet({ env, request }) {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const guildId = env.DISCORD_GUILD_ID;

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json(
      { error: "Missing Supabase credentials." },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 100);

  const query = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/balances`);
  query.searchParams.set("select", "user_id,display_name,balance,updated_at");
  query.searchParams.set("order", "balance.desc");
  query.searchParams.set("limit", String(limit));

  if (guildId) {
    query.searchParams.set("guild_id", `eq.${guildId}`);
  }

  const response = await fetch(query.toString(), {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`
    }
  });

  const data = await response.json();

  if (!response.ok) {
    return Response.json(
      {
        error: "Could not load Ember leaderboard.",
        status: response.status,
        details: data
      },
      { status: 500 }
    );
  }

  const leaders = data.map((row, index) => ({
    rank: index + 1,
    userId: row.user_id,
    displayName: row.display_name || "Unknown",
    balance: Number(row.balance || 0),
    updatedAt: row.updated_at || null
  }));

  return Response.json({ leaders });
}
