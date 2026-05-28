export async function onRequestGet({ env }) {
  const defaultDrops = [
    "Dragon 2H Sword",
    "Dragon Pickaxe",
    "Skull of Vet'ion",
    "Ring of the Gods",
    "Voidwaker Blade",
    "Vet'ion Jr."
  ];

  const drops = [];

  for (const name of defaultDrops) {
    const key = `drop:${name}`;
    const value = await env.DROPS_KV.get(key);

    drops.push({
      name,
      count: Number(value || 0)
    });
  }

  return Response.json({ drops });
}