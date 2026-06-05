const STAFF_ROLE_IDS = [
  "1364734283356569620",
  "1365445491776815104"
];

function getSession(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/ironkin_session=([^;]+)/);

  if (!match) return null;

  try {
    return JSON.parse(atob(match[1]));
  } catch {
    return null;
  }
}

function isStaff(request) {
  const session = getSession(request);

  return session?.roles?.some(roleId =>
    STAFF_ROLE_IDS.includes(roleId)
  );
}

export async function onRequestPost({ request, env }) {
  if (!isStaff(request)) {
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
