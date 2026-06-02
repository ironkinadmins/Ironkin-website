export async function onRequestGet({ env }) {
  const value = await env.DROPS_KV.get("events:archive");
  const archive = value ? JSON.parse(value) : [];

  archive.sort((a, b) => {
    const bDate = new Date(b.endedAt || b.endDate || 0).getTime();
    const aDate = new Date(a.endedAt || a.endDate || 0).getTime();
    return bDate - aDate;
  });

  return Response.json({
    archive
  });
}
