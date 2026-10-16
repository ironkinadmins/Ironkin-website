// Cloudflare Pages: RuneProfile player collection log and recent activity.
export async function onRequestGet({request,env}){
 const rsn=(new URL(request.url).searchParams.get('rsn')||'').trim();
 if(!/^[A-Za-z0-9 _-]{1,12}$/.test(rsn))return Response.json({error:'Invalid username'},{status:400});
 const cache=caches.default;const key=new Request(new URL('/api/profile-rune-journal?rsn='+encodeURIComponent(rsn.toLowerCase()),request.url));
 const hit=await cache.match(key);if(hit)return hit;
 const headers={Accept:'application/json','User-Agent':'IronkinClan/1.0 (ironkinclan.com; profile journal)'};
 if(env?.RUNEPROFILE_API_KEY)headers['X-API-Key']=env.RUNEPROFILE_API_KEY;
 const base='https://api.runeprofile.com/v1/accounts/'+encodeURIComponent(rsn);
 const load=async(path)=>{try{const r=await fetch(base+path,{headers,signal:AbortSignal.timeout(12000)});return r.ok?await r.json():null}catch{return null}};
 const [collection,activity]=await Promise.all([load('/collection-log'),load('/activities')]);
 if(!collection&&!activity)return Response.json({error:'RuneProfile data unavailable'},{status:502,headers:{'Cache-Control':'no-store'}});
 const output=Response.json({collection:collection?.tabs?collection:null,activities:Array.isArray(activity?.activities)?activity.activities:[],source:'RuneProfile'},{headers:{'Cache-Control':'public, max-age=60, s-maxage=300'}});
 await cache.put(key,output.clone());return output;
}
