// Read-only OSRS public progression aggregator. No user-provided hostnames or write operations.
const TTL=600;
async function fetchJson(url){const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),6500);try{const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'Ironkin-Profile/1.0'},signal:ctl.signal});if(!r.ok)throw Error('HTTP '+r.status);const raw=await r.text();if(raw.length>1500000)throw Error('Response too large');return JSON.parse(raw)}finally{clearTimeout(timer)}}
function unwrap(raw){return raw?.data||raw||{}}
function flattenItems(data){const items=data?.items||{};const out=[];function walk(obj,depth=0){if(!obj||depth>3||out.length>=600)return;if(Array.isArray(obj)){for(const value of obj)walk(value,depth+1);return}if(typeof obj!=='object')return;if(obj.id!==undefined&&obj.id!==null){out.push({id:Number(obj.id)||0,name:String(obj.name||'').slice(0,120),count:Number(obj.count)||1});return}for(const value of Object.values(obj))walk(value,depth+1)}walk(items);return out}
export async function onRequestGet({request}){
 const url=new URL(request.url),rsn=String(url.searchParams.get('rsn')||'').trim();
 if(!/^[a-zA-Z0-9 _-]{1,12}$/.test(rsn))return Response.json({error:'Invalid OSRS username'},{status:400});
 const key=new Request(url.origin+'/api/profile/osrs-progress?rsn='+encodeURIComponent(rsn.toLowerCase()));
 const cache=caches.default;const hit=await cache.match(key);if(hit)return hit;
 const name=encodeURIComponent(rsn);
 const [clogResult,recentResult]=await Promise.allSettled([
 fetchJson('https://templeosrs.com/api/collection-log/player_collection_log.php?player='+name+'&categories=all&includenames=1'),
 fetchJson('https://templeosrs.com/api/collection-log/player_recent_items.php?player='+name+'&count=30')
 ]);
 const raw=clogResult.status==='fulfilled'?unwrap(clogResult.value):null;
 const collection=raw?{available:true,total:Number(raw.total_collections_finished||raw.total_collections_in_response||0),possible:Number(raw.total_collections_available||0),lastChecked:raw.last_checked||null,items:flattenItems(raw)}:{available:false,items:[]};
 const recentRaw=recentResult.status==='fulfilled'?unwrap(recentResult.value):null;
 const recent=recentRaw?Object.values(recentRaw).filter(v=>v&&typeof v==='object'&&v.id!==undefined).slice(0,30).map(v=>({id:Number(v.id)||0,name:String(v.name||'').slice(0,120),date:Number(v.date_unix)||0})):[];
 const response=Response.json({rsn,collection,recent,sources:{collection:'TempleOSRS',skills:'Existing Wise Old Man integration',combat:'Not available through verified endpoints'},fetchedAt:new Date().toISOString()},{headers:{'Cache-Control':'public, max-age=60, s-maxage=600'}});
 if(collection.available||recent.length)await cache.put(key,response.clone());return response;
}
