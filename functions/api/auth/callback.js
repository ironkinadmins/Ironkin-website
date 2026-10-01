import { createSessionCookie, verifyOAuthState } from "../_auth.js";

function oauthError(origin, reason) {
  const target = new URL("/", origin);
  target.searchParams.set("auth_error", reason);
  return Response.redirect(target.toString(), 302);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateData = await verifyOAuthState(url.searchParams.get("state") || "", env);

  if (!stateData) return oauthError(url.origin, "oauth_state");
  if (url.searchParams.get("error")) return oauthError(url.origin, "discord_denied");
  if (!code) return oauthError(url.origin, "missing_code");

  const redirectUri = env.DISCORD_REDIRECT_URI || `${url.origin}/api/auth/callback`;

  try {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri
      })
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token) return oauthError(url.origin, "token_exchange");

    const authHeaders = { Authorization: `${tokenData.token_type || "Bearer"} ${tokenData.access_token}` };
    const userResponse = await fetch("https://discord.com/api/users/@me", { headers: authHeaders });
    if (!userResponse.ok) return oauthError(url.origin, "discord_user");
    const user = await userResponse.json();

    const guildResponse = await fetch(
      `https://discord.com/api/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`,
      { headers: authHeaders }
    );
    const guildMember = guildResponse.ok ? await guildResponse.json() : null;

    const session = {
      id: user.id,
      username: user.username,
      global_name: user.global_name,
      nick: guildMember?.nick || null,
      joined_at: guildMember?.joined_at || null,
      avatar: user.avatar,
      inGuild: guildResponse.ok,
      roles: guildMember?.roles || []
    };

    const sessionCookie = await createSessionCookie(session, env);
    const headers = new Headers({
      Location: new URL(stateData.r || "/", url.origin).toString(),
      "Cache-Control": "no-store"
    });
    // Remember members for 30 days. The cookie contains only the signed Ironkin
    // session, not the Discord access token or client secret.
    headers.append("Set-Cookie", `ironkin_session=${encodeURIComponent(sessionCookie)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
    // Clear the legacy state cookie from older deployments.
    headers.append("Set-Cookie", "ironkin_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("Discord OAuth callback failed", error);
    return oauthError(url.origin, "oauth_failed");
  }
}
