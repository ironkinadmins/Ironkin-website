// Cloudflare Pages Function: read-only RuneProfile quest and diary details.
export async function onRequestGet({request,env}) {
  const rsn = new URL(request.url).searchParams.get('rsn')?.trim() || '';
  if (!rsn || rsn.length > 12 || !/^[a-zA-Z0-9 _-]+$/.test(rsn)) return Response.json({error:'Invalid OSRS username'},{status:400});
  const headers={Accept:'application/json','User-Agent':'IronkinClan-Profile/1.0'};
  if(env?.RUNEPROFILE_API_KEY)headers['X-API-Key']=env.RUNEPROFILE_API_KEY;
  try {
    const base='https://api.runeprofile.com/v1/accounts/'+encodeURIComponent(rsn);
    const result=await Promise.all(['/quests','/achievement-diaries'].map(async path=>{
      const r=await fetch(base+path,{headers,cf:{cacheTtl:120,cacheEverything:true}});
      if(!r.ok)return {error:r.status===404?'Player not tracked on RuneProfile':r.status===429?'RuneProfile rate limit reached':'RuneProfile returned HTTP '+r.status};
      return r.json();
    }));
    return Response.json({quests:result[0],diaries:result[1]},{headers:{'Cache-Control':'public, max-age=120'}});
  }catch{return Response.json({error:'Unable to reach RuneProfile'},{status:502});}
}
