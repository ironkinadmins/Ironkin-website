import { getSession, isStaffSession } from "../../_auth.js";
import { decideProof } from "../../bingo/_proofDecision.js";
import { updateProofDiscordMessage } from "../../bingo/_discordProofs.js";

function noStore(headers = {}) {
  return { "Cache-Control": "no-store", ...headers };
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!isStaffSession(session)) {
    return Response.json({ error: "Staff only." }, { status: 403, headers: noStore() });
  }
  if (!String(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
    return Response.json({ error: "Invalid request." }, { status: 415, headers: noStore() });
  }
  const body = await request.json().catch(() => ({}));
  const reviewerName = String(session.nick || session.global_name || session.username || "Website Staff").slice(0, 100);
  const result = await decideProof(env, {
    proofId: String(body.proofId || ""),
    decision: String(body.decision || ""),
    reviewerId: String(session.id || session.userId || ""),
    reviewerName,
    expectedRevision: Number.isInteger(Number(body.stateRevision)) ? Number(body.stateRevision) : null
  });
  if (!result.ok) {
    return Response.json({ error: result.error, code: result.code || "" }, { status: result.status || 400, headers: noStore() });
  }
  await updateProofDiscordMessage(env, result.state, result.proof, result.proof.status, reviewerName, result.attack).catch(error => {
    console.warn("Could not update Discord proof message", error);
  });
  return Response.json({ ok: true, proof: result.proof, attack: result.attack, completed: result.completed, stateRevision: result.state.stateRevision }, { headers: noStore() });
}
