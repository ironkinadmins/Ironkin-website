export async function onRequestGet() {
  const GROUP_ID = "12095";
  const METRIC = "overall";
  const LIMIT = 8;

  const START_DATE = "2026-05-01T00:00:00.000Z";
  const END_DATE = new Date().toISOString();

  const gainsUrl =
    `https://api.wiseoldman.net/v2/groups/${GROUP_ID}/gained` +
    `?metric=${METRIC}` +
    `&startDate=${START_DATE}` +
    `&endDate=${END_DATE}` +
    `&limit=500`;

  const response = await fetch(gainsUrl);
  const data = await response.json();

  if (!response.ok) {
    return Response.json(
      { error: "Failed to load WOM activity", details: data },
      { status: response.status }
    );
  }

  const rows = Array.isArray(data) ? data : data.results || data.data || [];

  const getName = (entry) =>
    entry.player?.displayName ||
    entry.player?.username ||
    entry.displayName ||
    entry.username ||
    "Unknown";

  const getGained = (entry) =>
    entry.gained ||
    entry.data?.gained ||
    entry.data?.experience?.gained ||
    entry.data?.skills?.[METRIC]?.experience?.gained ||
    entry.skills?.[METRIC]?.experience?.gained ||
    0;

  const topGains = rows
    .map(entry => ({
      name: getName(entry),
      gained: getGained(entry)
    }))
    .filter(item => item.gained > 0)
    .sort((a, b) => b.gained - a.gained)
    .slice(0, LIMIT);

  return Response.json({
    title: "Recent Clan Activity",
    metric: METRIC,
    startDate: START_DATE,
    updatedAt: new Date().toISOString(),
    topGains
  });
}
