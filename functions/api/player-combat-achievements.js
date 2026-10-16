// Cloudflare Pages Function: per-player RuneProfile combat achievement progress.
export async function onRequestGet({request,env}) {
 const url=new URL(request.url);
 const rsn=(url.searchParams.get('rsn')||'').trim();
 if(!/^[A-Za-z0-9 _-]{1,12}$/.test(rsn))return Response.json({error:'Invalid OSRS username.'},{status:400});
 const cache=caches.default;
 const key=new Request(url.origin+'/api/player-combat-achievements?rsn='+encodeURIComponent(rsn.toLowerCase()));
 const cached=await cache.match(key);
 if(cached)return cached;
 try {
  const upstream='https://api.runeprofile.com/v1/accounts/'+encodeURIComponent(rsn)+'/combat-achievements/tasks';
  const headers={'Accept':'application/json','User-Agent':'IronkinClan/1.0 (ironkinclan.com; public player profile integration)'};
  if(env?.RUNEPROFILE_API_KEY)headers['X-API-Key']=env.RUNEPROFILE_API_KEY;
  const response=await fetch(upstream,{headers,signal:AbortSignal.timeout(12000)});
  if(!response.ok){
   const message=response.status===404?'Player not tracked on RuneProfile.':response.status===429?'RuneProfile rate limit reached. Please try again shortly.':'RuneProfile returned HTTP '+response.status;
   return Response.json({error:message,available:false},{status:response.status===404?404:502,headers:{'Cache-Control':'no-store'}});
  }
  const data=await response.json();
  if(!Array.isArray(data?.data))throw Error('Unexpected RuneProfile task response.');
  const tasks=data.data.map(t=>({index:Number(t.index),tierId:Number(t.tierId),tier:String(t.tierName||''),name:String(t.name||''),description:String(t.description||''),type:String(t.type||''),boss:String(t.monster||''),completed:t.completed===true,exempt:t.exempt===true})).filter(t=>Number.isFinite(t.index)&&t.name);
  const result=Response.json({available:true,rsn,totalPoints:Number(data.totalPoints)||0,tierReached:data.tierReached||null,tasks,source:'RuneProfile',fetchedAt:new Date().toISOString()},{headers:{'Cache-Control':'public, max-age=60, s-maxage=300'}});
  await cache.put(key,result.clone());return result;
 }catch(error){return Response.json({error:'Unable to retrieve RuneProfile progress: '+error.message,available:false},{status:502,headers:{'Cache-Control':'no-store'}})}
}
