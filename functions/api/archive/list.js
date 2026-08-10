import { repairArchiveEntryFromWom } from "../../_womCompetition.js";

export async function onRequestGet({ env }) {
  const value = await env.DROPS_KV.get("events:archive");
  let archive = value ? JSON.parse(value) : [];
  let repairedAny = false;

  // Self-heal older WOM archives that were saved during the previous silent
  // fetch-failure bug. Once repaired, the corrected snapshot is persisted.
  const repaired = await Promise.all(
    archive.map(async entry => {
      const result = await repairArchiveEntryFromWom(env, entry);
      repairedAny = repairedAny || result.repaired;
      return result.entry;
    })
  );
  archive = repaired;

  if (repairedAny) {
    await env.DROPS_KV.put("events:archive", JSON.stringify(archive));
  }

  archive.sort((a, b) => {
    const bDate = new Date(b.endedAt || b.endDate || 0).getTime();
    const aDate = new Date(a.endedAt || a.endDate || 0).getTime();
    return bDate - aDate;
  });

  return Response.json({ archive });
}
