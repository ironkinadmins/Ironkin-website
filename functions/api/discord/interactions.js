import { STAFF_ROLE_IDS } from "../_auth.js";
import { verifyDiscordInteraction } from "../bingo/_discordVerify.js";
import { decideProof } from "../bingo/_proofDecision.js";
import { buildProofMessage, updateProofDiscordMessage } from "../bingo/_discordProofs.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export async function onRequestPost({ request, env }) {
  const rawBody = await request.text();
  if (!(await verifyDiscordInteraction(request, env.DISCORD_PUBLIC_KEY, rawBody))) {
    return new Response("Invalid request signature.", { status: 401 });
  }
  const interaction = JSON.parse(rawBody);
  if (interaction.type === 1) return json({ type: 1 });
  if (interaction.type !== 3) return json({ type: 4, data: { content: "Unsupported interaction.", flags: 64 } });

  const customId = String(interaction.data?.custom_id || "");
  const match = customId.match(/^bingo-proof:(approve|reject):([a-f0-9-]{20,80})$/i);
  if (!match) return json({ type: 4, data: { content: "Unknown proof action.", flags: 64 } });

  const memberRoles = Array.isArray(interaction.member?.roles) ? interaction.member.roles : [];
  if (!memberRoles.some(role => STAFF_ROLE_IDS.includes(role))) {
    return json({ type: 4, data: { content: "Only Chainbearers and Chainkeepers can review proofs.", flags: 64 } });
  }

  const reviewerId = String(interaction.member?.user?.id || interaction.user?.id || "");
  const reviewerName = String(interaction.member?.nick || interaction.member?.user?.global_name || interaction.member?.user?.username || "Discord Staff");
  const result = await decideProof(env, { proofId: match[2], decision: match[1], reviewerId, reviewerName });
  if (!result.ok) {
    return json({ type: 4, data: { content: result.error || "Could not review proof.", flags: 64 } });
  }

  const status = result.proof.status;
  const message = buildProofMessage(result.state, result.proof, status, reviewerName, result.attack);
  // Update through the interaction response immediately; bot PATCH is a fallback for Discord/client edge cases.
  updateProofDiscordMessage(env, result.state, result.proof, status, reviewerName, result.attack).catch(() => {});
  return json({ type: 7, data: message });
}
