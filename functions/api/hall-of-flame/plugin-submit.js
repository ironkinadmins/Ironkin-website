import { supabaseRest } from "../_supabase.js";
import { requirePluginUser } from "../_pluginAuth.js";
import { bossMessage, normalizeBoss, parseDiscordBoard, parseSubmissionTimeToMs, projectedPlacement, uploadProof, notifyHallOfFlameReview } from "./_records.js";

const noStore = { "Cache-Control":"no-store" };


async function requirePersonalPluginUser(request, env) {
  // Hall of Flame uses the same per-member plugin API keys as the rest of
  // Ironkin. Keep accepting the legacy HOF header name so existing RuneLite
  // builds can send a personal key without relying on a shared server key.
  const personalKey = String(
    request.headers.get("x-api-key") ||
    request.headers.get("X-Ironkin-Plugin-Key") ||
    ""
  ).trim();

  if (!personalKey) {
    return { ok:false, response:Response.json({ error:"Missing personal plugin API key." }, { status:401, headers:noStore }) };
  }

  // Do not clone the incoming multipart Request here. In Workers, constructing a
  // second Request from the original can transfer/lock its body stream, causing
  // the later request.formData() call to fail even though the multipart header
  // and boundary are valid. Authentication only needs headers, so use a
  // body-less request for the existing plugin auth helper.
  const headers = new Headers(request.headers);
  headers.set("x-api-key", personalKey);
  const authRequest = new Request(request.url, { method:"GET", headers });
  return requirePluginUser(authRequest, env);
}

export async function onRequestPost({ request, env }) {
  const auth = await requirePersonalPluginUser(request, env);
  if (!auth.ok) return auth.response;
  const pluginUser = auth.pluginUser;

  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("multipart/form-data")) {
    return Response.json({ error:"Use multipart/form-data." }, { status:400, headers:noStore });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error:"Invalid multipart/form-data body." }, { status:400, headers:noStore });
  }

  const submittedPlayer = String(form.get("player") || form.get("rsn") || "").replace(/\s+/g, " ").trim().slice(0, 64);
  // Authentication is bound to the Discord member behind the personal API key.
  // Prefer the member's current profile RSN, but never reject a valid key just
  // because RuneLite reports a newer RSN than the key originally stored.
  const player = String(pluginUser?.rsn || submittedPlayer || pluginUser?.displayName || "").replace(/\s+/g, " ").trim().slice(0, 64);
  const boss = normalizeBoss(form.get("boss"));
  const timeText = String(form.get("time") || "").trim();
  const timeMs = parseSubmissionTimeToMs(timeText);
  const proof = form.get("proof");

  if (!player) return Response.json({ error:"player (RSN) is required." }, { status:400, headers:noStore });
  if (!boss || !timeMs) return Response.json({ error:"boss and a valid PB time are required." }, { status:400, headers:noStore });
  if (!(proof instanceof File) || proof.size <= 0) return Response.json({ error:"A proof screenshot is required." }, { status:400, headers:noStore });
  if (proof.size > 8 * 1024 * 1024) return Response.json({ error:"Screenshot must be 8 MB or smaller." }, { status:400, headers:noStore });
  if (!/^image\/(png|jpeg|webp|gif)$/i.test(proof.type || "")) return Response.json({ error:"Proof must be a PNG, JPG, WEBP, or GIF image." }, { status:400, headers:noStore });

  const bossConfigResponse = await supabaseRest(env, `hall_of_flame_bosses?select=*&name=eq.${encodeURIComponent(boss)}&active=eq.true&accept_submissions=eq.true&limit=1`);
  const bossConfig = (await bossConfigResponse.json())?.[0];
  if (!bossConfig) return Response.json({ error:"That boss is not currently accepting Hall of Flame submissions." }, { status:400, headers:noStore });

  // Keep plugin submissions in the exact same Council review workflow as website submissions.
  const message = await bossMessage(env, boss);
  const currentBoard = parseDiscordBoard(message?.embeds?.[0]?.description || "");
  const placement = projectedPlacement(currentBoard, timeMs);
  const id = crypto.randomUUID();
  const proofUrl = await uploadProof(env, proof, id);
  const row = {
    id,
    discord_id:String(pluginUser.discordId || "").slice(0, 120),
    display_name:player,
    boss,
    boss_slug:String(bossConfig.slug),
    time_ms:timeMs,
    time_text:timeText,
    proof_url:proofUrl,
    status:"pending",
    projected_placement:placement,
    created_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
  };

  await supabaseRest(env, "hall_of_flame_submissions", {
    method:"POST",
    headers:{ Prefer:"return=minimal" },
    body:JSON.stringify(row)
  });

  let reviewNotification = { sent:false };
  try {
    reviewNotification = await notifyHallOfFlameReview(env, row);
    if (reviewNotification?.sent && reviewNotification.messageId && reviewNotification.channelId) {
      const reviewDiscord = {
        review_discord_message_id:String(reviewNotification.messageId),
        review_discord_channel_id:String(reviewNotification.channelId),
        updated_at:new Date().toISOString()
      };
      await supabaseRest(env, `hall_of_flame_submissions?id=eq.${encodeURIComponent(id)}`, {
        method:"PATCH",
        headers:{ Prefer:"return=minimal" },
        body:JSON.stringify(reviewDiscord)
      });
      Object.assign(row, reviewDiscord);
    }
  } catch (error) {
    reviewNotification = { sent:false, error:String(error?.message || error) };
  }

  return Response.json({
    ok:true,
    submission:{
      id:row.id,
      player:row.display_name,
      boss:row.boss,
      time:row.time_text,
      status:row.status,
      projectedPlacement:row.projected_placement,
      proofUrl:row.proof_url
    },
    reviewNotification
  }, { status:201, headers:noStore });
}
