function proofColor(status) {
  if (status === "approved") return 0x2ecc71;
  if (status === "rejected") return 0xe74c3c;
  return 0xf1c40f;
}

function clean(value, max = 500) {
  return String(value || "").slice(0, max);
}

function button(customId, label, style, disabled = false) {
  return { type: 2, custom_id: customId, label, style, disabled };
}

export function buildProofMessage(state, proof, status = "pending", reviewer = "", attack = null) {
  const tile = state?.tiles?.[Number(proof.tileIndex)];
  const teamName = state?.teams?.[proof.team]?.name || proof.team || "Unknown team";
  const statusText = status.charAt(0).toUpperCase() + status.slice(1);
  const fields = [
    { name: "Player", value: clean(proof.player || "Unknown", 100), inline: true },
    { name: "Team", value: clean(teamName, 100), inline: true },
    { name: "Tile", value: clean(tile?.name || proof.tileName || `Tile ${Number(proof.tileIndex) + 1}`, 120), inline: true },
    { name: "Quantity", value: String(Math.max(1, Number(proof.quantity) || 1)), inline: true },
    { name: "Status", value: statusText, inline: true }
  ];
  if (reviewer) fields.push({ name: "Reviewed By", value: clean(reviewer, 100), inline: true });
  if (attack?.result) fields.push({ name: "Battle Result", value: attack.result.toUpperCase(), inline: true });
  if (proof.url) fields.push({ name: "Proof", value: `[Open proof](${clean(proof.url, 900)})`, inline: false });
  if (proof.note) fields.push({ name: "Note", value: clean(proof.note, 900), inline: false });

  const isPending = status === "pending";
  return {
    content: isPending ? `<@&${clean(state?.discordCouncilRoleId || "1515576495844757524", 30)}>` : "",
    embeds: [{
      title: `Battleship Bingo Proof — ${statusText}`,
      color: proofColor(status),
      fields,
      footer: { text: `Proof ID: ${proof.id}` },
      timestamp: new Date().toISOString()
    }],
    components: [{
      type: 1,
      components: [
        button(`bingo-proof:approve:${proof.id}`, "Approve", 3, !isPending),
        button(`bingo-proof:reject:${proof.id}`, "Reject", 4, !isPending)
      ]
    }],
    allowed_mentions: isPending ? { parse: [], roles: [clean(state?.discordCouncilRoleId || "1515576495844757524", 30)] } : { parse: [] }
  };
}

async function resolveProofChannelId(env) {
  if (env.DISCORD_PROOF_CHANNEL_ID) return String(env.DISCORD_PROOF_CHANNEL_ID);
  const webhook = String(env.DISCORD_PROOF_WEBHOOK_URL || "");
  if (!webhook) return "";
  try {
    const response = await fetch(webhook.split("?")[0]);
    if (!response.ok) return "";
    const data = await response.json();
    return String(data.channel_id || "");
  } catch {
    return "";
  }
}

export async function sendPendingProofToDiscord(env, state, proof) {
  if (!env.DISCORD_PROOF_BOT_TOKEN) return "";
  const channelId = await resolveProofChannelId(env);
  if (!channelId) return "";
  state.discordCouncilRoleId = env.COUNCIL_MEMBER_ROLE_ID || "1515576495844757524";
  const response = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bot ${env.DISCORD_PROOF_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildProofMessage(state, proof, "pending"))
  });
  if (!response.ok) {
    console.warn("Discord proof message failed", response.status, await response.text());
    return "";
  }
  const message = await response.json();
  proof.discordChannelId = channelId;
  proof.discordMessageId = String(message.id || "");
  return proof.discordMessageId;
}

export async function updateProofDiscordMessage(env, state, proof, status, reviewer = "", attack = null) {
  if (!env.DISCORD_PROOF_BOT_TOKEN || !proof?.discordChannelId || !proof?.discordMessageId) return false;
  const response = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(proof.discordChannelId)}/messages/${encodeURIComponent(proof.discordMessageId)}`, {
    method: "PATCH",
    headers: { "Authorization": `Bot ${env.DISCORD_PROOF_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildProofMessage(state, proof, status, reviewer, attack))
  });
  if (!response.ok) console.warn("Discord proof update failed", response.status, await response.text());
  return response.ok;
}
