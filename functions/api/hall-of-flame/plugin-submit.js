import { supabaseRest } from "../_supabase.js";
import { bossMessage, normalizeBoss, parseDiscordBoard, parseTimeToMs, projectedPlacement, uploadProof, notifyHallOfFlameReview } from "./_records.js";

const noStore = { "Cache-Control":"no-store" };

function unauthorized(message = "Invalid plugin API key.") {
  return Response.json({ error:message }, { status:401, headers:noStore });
}

function pluginAuthorized(request, env) {
  const expected = String(env.HALL_OF_FLAME_PLUGIN_API_KEY || "").trim();
  if (!expected) return false;
  const headerKey = String(request.headers.get("X-Ironkin-Plugin-Key") || "").trim();
  const auth = String(request.headers.get("Authorization") || "").trim();
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  return (headerKey && headerKey === expected) || (bearer && bearer === expected);
}

export async function onRequestPost({ request, env }) {
  if (!String(env.HALL_OF_FLAME_PLUGIN_API_KEY || "").trim()) {
    return Response.json({ error:"Hall of Flame plugin submissions are not configured." }, { status:503, headers:noStore });
  }
  if (!pluginAuthorized(request, env)) return unauthorized();

  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error:"Use multipart/form-data." }, { status:400, headers:noStore });
  }

  const player = String(form.get("player") || form.get("rsn") || "").replace(/\s+/g, " ").trim().slice(0, 64);
  const boss = normalizeBoss(form.get("boss"));
  const timeText = String(form.get("time") || "").trim();
  const timeMs = parseTimeToMs(timeText);
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
    discord_id:`runelite:${player.toLowerCase()}`.slice(0, 120),
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
