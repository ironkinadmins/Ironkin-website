export async function onRequestGet({ request, env }) {

  const redirectUri =
    env.DISCORD_REDIRECT_URI ||
    `${new URL(request.url).origin}/api/auth/callback`;

  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify guilds guilds.members.read"
  });

  return Response.redirect(
    `https://discord.com/oauth2/authorize?${params.toString()}`,
    302
  );
}
