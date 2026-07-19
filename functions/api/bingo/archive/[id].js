const PREFIX = "bingo:archive:v1:";

function publicProof(proof) {
  return {
    id: String(proof?.id || ""),
    tileIndex: Number(proof?.tileIndex || 0),
    team: proof?.team === "ash" ? "ash" : "ember",
    player: String(proof?.player || ""),
    url: String(proof?.url || ""),
    note: String(proof?.note || ""),
    quantity: Math.max(1, Number(proof?.quantity || 1)),
    status: String(proof?.status || "pending"),
    createdAt: String(proof?.createdAt || ""),
    tileName: String(proof?.tileName || ""),
    source: String(proof?.source || ""),
    reviewedBy: String(proof?.reviewedBy || ""),
    reviewedAt: String(proof?.reviewedAt || ""),
    rejectionReason: String(proof?.rejectionReason || "")
  };
}

export async function onRequestGet({ params, env }) {
  const id = String(params.id || "").trim();
  if (!/^bingo-[a-zA-Z0-9-]+$/.test(id)) {
    return Response.json({ error: "Invalid archive ID." }, { status: 400 });
  }
  const raw = await env.DROPS_KV.get(`${PREFIX}${id}`);
  if (!raw) return Response.json({ error: "Archived Bingo not found." }, { status: 404 });

  const archive = JSON.parse(raw);
  const publicArchive = {
    ...archive,
    state: {
      ...archive.state,
      proofs: Array.isArray(archive.state?.proofs) ? archive.state.proofs.map(publicProof) : []
    }
  };
  return Response.json(publicArchive, {
    headers: { "Cache-Control": "public, max-age=300" }
  });
}
