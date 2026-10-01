import { getSession, isStaffSession } from "../_auth.js";
import { supabaseRest } from "../_supabase.js";
import { bossMessage, displayName, normalizeBoss, parseDiscordBoard, parseTimeToMs, projectedPlacement, uploadProof } from "./_records.js";

const noStore = { "Cache-Control":"no-store" };

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return Response.json({ error:"Sign in with Discord to view submissions." }, { status:401, headers:noStore });
  const staff = isStaffSession(session);
  const url = new URL(request.url);
  const status = String(url.searchParams.get("status") || "").trim();
  const filters = staff && url.searchParams.get("scope") === "staff" ? [] : [`discord_id=eq.${encodeURIComponent(session.id)}`];
  if (status && ["pending","approved","rejected"].includes(status)) filters.push(`status=eq.${status}`);
  const query = `hall_of_flame_submissions?select=*&${filters.join("&")}${filters.length ? "&" : ""}order=created_at.desc&limit=250`;
  const response = await supabaseRest(env, query);
  return Response.json({ signedIn:true, isStaff:staff, submissions:await response.json() }, { headers:noStore });
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return Response.json({ error:"Sign in with Discord before submitting a PB." }, { status:401, headers:noStore });
  if (session.inGuild === false) return Response.json({ error:"Only Ironkin Discord members can submit records." }, { status:403, headers:noStore });
  const form = await request.formData();
  const boss = normalizeBoss(form.get("boss"));
  const timeText = String(form.get("time") || "").trim();
  const timeMs = parseTimeToMs(timeText);
  const proof = form.get("proof");
  if (!boss || !timeMs) return Response.json({ error:"Choose a boss and enter a valid PB time." }, { status:400, headers:noStore });
  if (!(proof instanceof File) || proof.size <= 0) return Response.json({ error:"A proof screenshot is required." }, { status:400, headers:noStore });
  if (proof.size > 8 * 1024 * 1024) return Response.json({ error:"Screenshot must be 8 MB or smaller." }, { status:400, headers:noStore });
  if (!/^image\/(png|jpeg|webp|gif)$/i.test(proof.type || "")) return Response.json({ error:"Proof must be a PNG, JPG, WEBP, or GIF image." }, { status:400, headers:noStore });

  const bossConfigResponse = await supabaseRest(env, `hall_of_flame_bosses?select=*&name=eq.${encodeURIComponent(boss)}&active=eq.true&accept_submissions=eq.true&limit=1`);
  const bossConfig = (await bossConfigResponse.json())?.[0];
  if (!bossConfig) return Response.json({ error:"That boss is not currently accepting Hall of Flame submissions." }, { status:400, headers:noStore });
  const message = await bossMessage(env, boss);
  const currentBoard = parseDiscordBoard(message?.embeds?.[0]?.description || "");
  const placement = projectedPlacement(currentBoard, timeMs);
  const id = crypto.randomUUID();
  const proofUrl = await uploadProof(env, proof, id);
  const row = { id, discord_id:String(session.id), display_name:displayName(session), boss, boss_slug:String(bossConfig.slug), time_ms:timeMs, time_text:timeText, proof_url:proofUrl, status:"pending", projected_placement:placement, created_at:new Date().toISOString(), updated_at:new Date().toISOString() };
  await supabaseRest(env, "hall_of_flame_submissions", { method:"POST", headers:{ Prefer:"return=minimal" }, body:JSON.stringify(row) });
  return Response.json({ ok:true, submission:row }, { status:201, headers:noStore });
}
