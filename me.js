import { getSession } from "./functions/api/_auth.js";

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);

  if (!session) {
    return Response.json({ signedIn: false });
  }

  return Response.json({
    signedIn: true,
    user: session
  });
}
