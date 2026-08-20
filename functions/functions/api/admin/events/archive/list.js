import { hybridKv } from "../../../../_hybridKv.js";
import { repairArchiveEntryFromWom } from "../../../../_womCompetition.js";

export async function onRequestGet({ env }) {
  const value = await hybridKv(env, "drops").get("events:archive");
  let archive = value ? JSON.parse(value) : [];
  let repairedAny = false;

  const repaired = await Promise.all(
    archive.map(async entry => {
      const result = await repairArchiveEntryFromWom(env, entry);
      repairedAny = repairedAny || result.repaired;
      return result.entry;
    })
  );
  archive = repaired;

  if (repairedAny) {
    await hybridKv(env, "drops").put("events:archive", JSON.stringify(archive));
  }

  archive.sort((a, b) => {
    const bDate = new Date(b.endedAt || b.endDate || 0).getTime();
    const aDate = new Date(a.endedAt || a.endDate || 0).getTime();
    return bDate - aDate;
  });

  return Response.json({ archive });
}
