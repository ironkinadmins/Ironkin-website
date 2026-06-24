import { getSession, isStaffSession } from "../../_auth.js";
export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json(
      { error: "Staff only." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const archiveId = String(body.id || "").trim();

  if (!archiveId) {
    return Response.json(
      { error: "Missing archive ID." },
      { status: 400 }
    );
  }

  const archiveValue = await env.DROPS_KV.get("events:archive");
  const archive = archiveValue ? JSON.parse(archiveValue) : [];
  const updatedArchive = archive.filter(entry => entry.id !== archiveId);

  if (updatedArchive.length === archive.length) {
    return Response.json(
      { error: "Archive entry not found." },
      { status: 404 }
    );
  }

  await env.DROPS_KV.put(
    "events:archive",
    JSON.stringify(updatedArchive)
  );

  return Response.json({
    success: true,
    deletedId: archiveId
  });
}
