const DEFAULT_CLAN_NEWS_CHANNEL_ID = "1364729142796619846";
const DISCORD_API = "https://discord.com/api/v10";
const FRESH_CACHE_SECONDS = 120;
const FALLBACK_CACHE_SECONDS = 86400;

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function cacheRequest(url, type) {
  const cacheUrl = new URL(url);
  cacheUrl.search = "";
  cacheUrl.pathname = `/__cache/clan-news/${type}`;
  return new Request(cacheUrl.toString(), { method: "GET" });
}

function normalizeMessages(messages, channelId) {
  const entries = messages
    .filter(message => message.content || message.embeds?.length || message.attachments?.length)
    .map(message => ({
      id: message.id,
      createdAt: message.timestamp,
      editedAt: message.edited_timestamp || null,
      author: message.member?.nick || message.author?.global_name || message.author?.username || "Ironkin Staff",
      avatar: message.author?.avatar
        ? `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png?size=128`
        : "",
      content: message.content || "",
      messageUrl: `https://discord.com/channels/${message.guild_id || "@me"}/${channelId}/${message.id}`,
      embeds: (message.embeds || []).map(embed => ({
        title: embed.title || "",
        description: embed.description || "",
        url: embed.url || "",
        color: embed.color || null,
        image: embed.image?.url || embed.thumbnail?.url || "",
        fields: (embed.fields || []).map(field => ({
          name: field.name || "",
          value: field.value || "",
          inline: Boolean(field.inline)
        }))
      })),
      attachments: (message.attachments || []).map(file => ({
        name: file.filename,
        url: file.url,
        contentType: file.content_type || ""
      }))
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return {
    channelId,
    entries,
    fetchedAt: new Date().toISOString()
  };
}

async function store(cache, request, payload, maxAge, context) {
  const response = json(payload, {
    headers: {
      "Cache-Control": `public, max-age=${maxAge}`,
      "X-Clan-News-Cache": "stored"
    }
  });
  const operation = cache.put(request, response);
  if (context?.waitUntil) context.waitUntil(operation);
  else await operation;
}

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default;
  const freshKey = cacheRequest(request.url, "fresh");
  const fallbackKey = cacheRequest(request.url, "fallback");

  const cached = await cache.match(freshKey);
  if (cached) {
    const response = new Response(cached.body, cached);
    response.headers.set("X-Clan-News-Cache", "HIT");
    return response;
  }

  const token = env.DISCORD_BOT_TOKEN;
  const channelId = env.CLAN_NEWS_CHANNEL_ID || DEFAULT_CLAN_NEWS_CHANNEL_ID;

  if (!token) {
    const fallback = await cache.match(fallbackKey);
    if (fallback) {
      const response = new Response(fallback.body, fallback);
      response.headers.set("X-Clan-News-Cache", "STALE");
      response.headers.set("Warning", '110 - "Serving cached Clan News because the Discord token is unavailable"');
      return response;
    }
    return json({ error: "Missing DISCORD_BOT_TOKEN." }, { status: 500 });
  }

  try {
    const discordResponse = await fetch(
      `${DISCORD_API}/channels/${channelId}/messages?limit=25`,
      { headers: { Authorization: `Bot ${token}` } }
    );
    const discordData = await discordResponse.json().catch(() => null);

    if (!discordResponse.ok || !Array.isArray(discordData)) {
      throw new Error(`Discord returned ${discordResponse.status}.`);
    }

    const payload = normalizeMessages(discordData, channelId);
    const context = { waitUntil };
    await Promise.all([
      store(cache, freshKey, payload, FRESH_CACHE_SECONDS, context),
      store(cache, fallbackKey, payload, FALLBACK_CACHE_SECONDS, context)
    ]);

    return json(payload, {
      headers: {
        "Cache-Control": `public, max-age=${FRESH_CACHE_SECONDS}`,
        "X-Clan-News-Cache": "MISS"
      }
    });
  } catch (error) {
    const fallback = await cache.match(fallbackKey);
    if (fallback) {
      const response = new Response(fallback.body, fallback);
      response.headers.set("X-Clan-News-Cache", "STALE");
      response.headers.set("Warning", '110 - "Serving cached Clan News because Discord is unavailable"');
      return response;
    }

    return json(
      { error: "Could not load Clan News messages.", details: error.message },
      { status: 502 }
    );
  }
}
