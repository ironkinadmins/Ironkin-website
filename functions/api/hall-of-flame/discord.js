import { approvedForBoss, formatTime, getHallOfFlameDiscordSettings, mergeBoard, parseDiscordBoard } from "./_records.js";
import { supabaseRest } from "../_supabase.js";

export async function onRequestGet({ env }) {
  const token = env.DISCORD_BOT_TOKEN;
  const { channelId } = await getHallOfFlameDiscordSettings(env);
  if (!token || !channelId) return Response.json({ error:"Missing Discord token or channel ID." }, { status:500 });

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=100`, { headers:{ Authorization:`Bot ${token}` } });
  const data = await response.json();
  if (!response.ok) return Response.json({ error:"Could not load Hall of Flame messages.", status:response.status, details:data }, { status:500 });

  const entries = data.map(message => {
    const embed=message.embeds?.[0];
    return { id:message.id, createdAt:message.timestamp, author:message.author?.username||"Discord", content:message.content||"", title:embed?.title||"", description:embed?.description||"", fields:embed?.fields||[], color:embed?.color??null, imageUrl:embed?.image?.url||"", thumbnailUrl:embed?.thumbnail?.url||"", messageUrl:`https://discord.com/channels/${message.guild_id||"@me"}/${channelId}/${message.id}` };
  });

  // The database is the source of truth for approvals. Overlay approved records
  // onto the Discord-derived boards so a transient Discord PATCH failure can
  // never leave the website showing an older leaderboard.
  try {
    const bossesResponse = await supabaseRest(env, "hall_of_flame_bosses?select=name,image_url&active=eq.true&visible=eq.true");
    const bosses = await bossesResponse.json();
    const byName = new Map(entries.map(entry => [String(entry.title||"").trim().toLowerCase(), entry]));
    for (const boss of Array.isArray(bosses) ? bosses : []) {
      const key=String(boss.name||"").trim().toLowerCase();
      const entry=byName.get(key);
      const legacy=parseDiscordBoard(entry?.description||"");
      const approved=await approvedForBoss(env,boss.name);
      const board=mergeBoard(legacy,approved);
      if (!board.length) continue;
      const description=board.map((row,i)=>`${["🥇","🥈","🥉"][(Number(row.placement)||(i+1))-1]||"🏅"} • ${row.proofUrl?`[${row.player} ${formatTime(row.timeMs)}](${row.proofUrl})`:`${row.player} ${formatTime(row.timeMs)}`}`).join("\n");
      if (entry) {
        entry.description=description;
        if (boss.image_url) entry.imageUrl=boss.image_url;
      } else {
        entries.push({ id:`db-${key}`, createdAt:"", author:"Ironkin", content:"", title:boss.name, description, fields:[], color:null, imageUrl:boss.image_url||"", thumbnailUrl:"", messageUrl:"" });
      }
    }
  } catch (error) {
    console.warn("Hall of Flame database overlay failed:", error?.message || error);
  }
  return Response.json({ entries });
}
