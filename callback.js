export async function onRequestGet({ request, env }) {

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const redirectUri =
    env.DISCORD_REDIRECT_URI ||
    `${url.origin}/api/auth/callback`;

  if (!code) {
    return new Response("Missing Discord code", {
      status: 400
    });
  }

  const tokenResponse = await fetch(
    "https://discord.com/api/oauth2/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri
      })
    }
  );

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok) {
    return Response.json(tokenData, {
      status: 400
    });
  }

  const userResponse = await fetch(
    "https://discord.com/api/users/@me",
    {
      headers: {
        Authorization:
          `${tokenData.token_type} ${tokenData.access_token}`
      }
    }
  );

  const user = await userResponse.json();

  const guildResponse = await fetch(
    `https://discord.com/api/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`,
    {
      headers: {
        Authorization:
          `${tokenData.token_type} ${tokenData.access_token}`
      }
    }
  );

  let guildMember = null;

  if (guildResponse.ok) {
    guildMember = await guildResponse.json();
  }

  const session = {
    id: user.id,
    username: user.username,
    global_name: user.global_name,
    avatar: user.avatar,
    inGuild: guildResponse.ok,
    roles: guildMember?.roles || []
  };

  const cookie =
    btoa(JSON.stringify(session));

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie":
        `ironkin_session=${cookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
    }
  });
}
