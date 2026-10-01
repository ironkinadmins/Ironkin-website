import { getSession, isStaffSession } from "../_auth.js";
import { supabaseRest } from "../_supabase.js";
import { approvedForBoss, bossMessage, getSubmission, mergeBoard, parseDiscordBoard, projectedPlacement, syncDiscordBoard } from "./_records.js";

const noStore = { "Cache-Control":"no-store" };
export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!isStaffSession(session)) return Response.json({ error:"Staff access required." }, { status:403, headers:noStore });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  const action = String(body.action || "").trim().toLowerCase();
  if (!id || !["approve","reject"].includes(action)) return Response.json({ error:"Invalid review request." }, { status:400, headers:noStore });
  const submission = await getSubmission(env, id);
  if (!submission) return Response.json({ error:"Submission not found." }, { status:404, headers:noStore });
  if (submission.status !== "pending") return Response.json({ error:"This submission has already been reviewed." }, { status:409, headers:noStore });

  const message = await bossMessage(env, submission.boss);
  const legacy = parseDiscordBoard(message?.embeds?.[0]?.description || "");
  const alreadyApproved = await approvedForBoss(env, submission.boss);
  const currentBoard = mergeBoard(legacy, alreadyApproved);
  const placement = projectedPlacement(currentBoard, Number(submission.time_ms));
  const now = new Date().toISOString();
  const status = action === "approve" ? "approved" : "rejected";
  await supabaseRest(env, `hall_of_flame_submissions?id=eq.${encodeURIComponent(id)}`, { method:"PATCH", headers:{ Prefer:"return=minimal" }, body:JSON.stringify({ status, final_placement:placement, reviewed_by:String(session.id), reviewed_by_name:String(session.nick || session.global_name || session.username || "Staff"), reviewed_at:now, updated_at:now }) });

  let discord = { synced:false };
  const configResponse = await supabaseRest(env, `hall_of_flame_bosses?select=discord_sync,image_url&name=eq.${encodeURIComponent(submission.boss)}&limit=1`);
  const bossConfig = (await configResponse.json())?.[0];
  if (status === "approved") {
    const approved = [...alreadyApproved, { ...submission, status:"approved" }];
    const board = mergeBoard(legacy, approved);
    if (bossConfig?.discord_sync !== false && board.some(row => row.submissionId === id || (row.source === "verified" && row.proofUrl === submission.proof_url))) {
      discord = await syncDiscordBoard(env, submission.boss, board, submission.proof_url, bossConfig?.image_url || "");
    }
  }
  return Response.json({ ok:true, status, finalPlacement:placement, discord }, { headers:noStore });
}
