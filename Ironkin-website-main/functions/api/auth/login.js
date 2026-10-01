import { createOAuthState, getSession } from "../_auth.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const requestedReturnTo = url.searchParams.get("returnTo") || "/";
  const returnTo = requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//") ? requestedReturnTo : "/";

  // A valid Ironkin session means Discord does not need to be invoked again.
  const existingSession = await getSession(request, env);
  if (existingSession) return Response.redirect(new URL(returnTo, url.origin).toString(), 302);

  const redirectUri = env.DISCORD_REDIRECT_URI || `${url.origin}/api/auth/callback`;
  // Signed state does not depend on a browser cookie surviving Discord's in-app
  // browser / external-browser handoff and is not overwritten by another login tab.
  const state = await createOAuthState(returnTo, env);

  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify guilds guilds.members.read",
    state
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://discord.com/oauth2/authorize?${params.toString()}`,
      "Cache-Control": "no-store"
    }
  });
}
