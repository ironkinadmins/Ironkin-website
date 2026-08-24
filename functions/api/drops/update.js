import { hybridKv } from "../../_hybridKv.js";
import { getSession, isStaffSession } from "../_auth.js";
import { getDropListKey, readDropsWithClanGoalFallback } from "./_dropKeys.js";

function bossName(drop) {
  return String(drop?.boss || "").trim() || "Unassigned";
}

function groupByBoss(drops) {
  const order = [];
  const groups = new Map();
  for (const drop of drops) {
    const boss = bossName(drop);
    if (!groups.has(boss)) {
      order.push(boss);
      groups.set(boss, []);
    }
    groups.get(boss).push(drop);
  }
  return { order, groups };
}

export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  const body = await request.json();
  const eventId = String(body.eventId || "").trim();
  if (!eventId) return Response.json({ error: "Missing eventId." }, { status: 400 });

  const result = await readDropsWithClanGoalFallback(env, eventId);
  let drops = Array.isArray(result.drops) ? result.drops : [];

  // Move an entire boss group while preserving item order inside each boss.
  if (body.moveBoss) {
    const requestedBoss = String(body.boss || "").trim() || "Unassigned";
    const { order, groups } = groupByBoss(drops);
    const index = order.indexOf(requestedBoss);
    if (index < 0) return Response.json({ error: "Boss group not found." }, { status: 404 });
    const target = body.moveBoss === "up" ? index - 1 : body.moveBoss === "down" ? index + 1 : index;
    if (target >= 0 && target < order.length && target !== index) {
      [order[index], order[target]] = [order[target], order[index]];
      drops = order.flatMap(boss => groups.get(boss) || []);
    }
  } else {
    const name = String(body.name || "").trim();
    if (!name) return Response.json({ error: "Missing drop name." }, { status: 400 });
    let index = drops.findIndex(drop => String(drop?.name || "").toLowerCase() === name.toLowerCase());
    if (index < 0) return Response.json({ error: "Tracked item not found." }, { status: 404 });

    if (body.boss !== undefined) {
      const newBoss = String(body.boss || "").trim();
      const item = { ...drops[index], boss: newBoss };
      drops.splice(index, 1);

      // If that boss already exists, place the item at the end of its group so the
      // website remains grouped by boss automatically. Otherwise keep its old slot.
      const normalized = newBoss || "Unassigned";
      const lastSameBoss = drops.map(bossName).lastIndexOf(normalized);
      if (lastSameBoss >= 0) drops.splice(lastSameBoss + 1, 0, item);
      else drops.splice(Math.min(index, drops.length), 0, item);
      index = drops.indexOf(item);
    }

    const move = String(body.move || "");
    if (move === "up" && index > 0 && bossName(drops[index - 1]) === bossName(drops[index])) {
      [drops[index - 1], drops[index]] = [drops[index], drops[index - 1]];
    } else if (move === "down" && index < drops.length - 1 && bossName(drops[index + 1]) === bossName(drops[index])) {
      [drops[index + 1], drops[index]] = [drops[index], drops[index + 1]];
    }
  }

  await hybridKv(env, "drops").put(result.key || getDropListKey(eventId), JSON.stringify(drops));
  return Response.json({ success: true, eventId, drops });
}
