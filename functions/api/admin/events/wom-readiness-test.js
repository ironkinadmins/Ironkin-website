import { getSession, isStaffSession } from "../../_auth.js";
import { womFetch } from "../../../_wom.js";

// Read-only check: never creates competitions, posts to Discord, or changes KV.
export async function onRequest({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) return Response.json({error:"Staff only"}, {status:403});
  if (request.method !== "GET") return Response.json({error:"Method not allowed"}, {status:405});
  const groupId = Number(env.WOM_GROUP_ID || 12095);
  const checks = {
    apiKeyConfigured: !!String(env.WOM_API_KEY || "").trim(),
    groupVerificationConfigured: !!String(env.WOM_GROUP_VERIFICATION_CODE || "").trim(),
    coordinatorBindingConfigured: !!env.CYCLE_COORDINATOR?.fetch,
    automaticCreationEnabled: env.CYCLE_AUTO_WOM_CREATE_ENABLED === "true",
    automaticFinalizationEnabled: env.CYCLE_AUTO_FINALIZE_ENABLED === "true"
  };
  if (!Number.isSafeInteger(groupId) || groupId < 1) return Response.json({error:"Invalid WOM_GROUP_ID",checks},{status:400});
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    let response;
    try { response = await womFetch(env, `/groups/${groupId}`, {signal:controller.signal}); }
    finally { clearTimeout(timeout); }
    if (!response.ok) return Response.json({groupId,checks,reachable:false,error:`WOM returned HTTP ${response.status}`},{headers:{"Cache-Control":"no-store"}});
    const group = await response.json();
    if (Number(group?.id) !== groupId) return Response.json({groupId,checks,reachable:false,error:"WOM returned a different group ID"},{headers:{"Cache-Control":"no-store"}});
    return Response.json({groupId,groupName:String(group.name || ""),reachable:true,checks,note:"Read-only group lookup succeeded. This does not prove competition creation permissions."},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    return Response.json({groupId,checks,reachable:false,error:`WOM request failed: ${String(error?.message || error).slice(0,160)}`},{headers:{"Cache-Control":"no-store"}});
  }
}
