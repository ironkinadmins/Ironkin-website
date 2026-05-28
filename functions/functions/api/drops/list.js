export async function onRequestGet({ env }) {
  const eventResponse = await fetch(
    "https://ironkin-website.pages.dev/api/event-standings"
  );

  const eventData = await eventResponse.json();

  const metric = eventData.metric || "default";

  const dropListValue =
    await env.DROPS_KV.get(`drop-list:${metric}`);

  const defaultDrops = [
    "No drop list configured for this event."
  ];

  const dropNames = dropListValue
    ? JSON.parse(dropListValue)
    : defaultDrops;

  const drops = [];

  for (const name of dropNames) {
    const key = `drop-count:${metric}:${name}`;
    const value = await env.DROPS_KV.get(key);

    drops.push({
      name,
      count: Number(value || 0)
    });
  }

  return Response.json({
    metric,
    drops
  });
}