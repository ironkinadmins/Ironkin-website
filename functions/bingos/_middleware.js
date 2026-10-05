import { requirePluginUser } from "../api/_pluginAuth.js";

export async function onRequest(context) {
  // Use the same Discord-ID-based plugin authentication as every other
  // RuneLite endpoint. Current profile data is hydrated on each request, so
  // changing an OSRS name never requires generating a new personal API key.
  const auth = await requirePluginUser(context.request, context.env);
  if (!auth.ok) return auth.response;

  context.data.pluginUser = auth.pluginUser;
  return context.next();
}
