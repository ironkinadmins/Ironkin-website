export async function onRequestGet({ env }) {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return Response.json(
      { error: "Missing Supabase credentials." },
      { status: 500 }
    );
  }

  const url =
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/balances` +
    `?select=display_name,balance,user_id,guild_id` +
    `&order=balance.desc` +
    `&limit=100`;

  const response = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json"
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

  const leaderboard = data.map((row, index) => ({
    rank: index + 1,
    user_id: row.user_id,
    guild_id: row.guild_id,
    display_name: row.display_name || "Unknown",
    balance: row.balance || 0
  }));

  return Response.json({ leaderboard });
}