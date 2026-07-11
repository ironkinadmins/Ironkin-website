const COOKIE = "ironkin_bingo_team";
const CONFIG_KEY = "bingo:team-access:v2";
const TTL = 60 * 60 * 24 * 14;
const ITERATIONS = 100000;
const MAX_ATTEMPTS = 8;
const WINDOW = 15 * 60;
const enc = new TextEncoder();

function b64url(bytes) { let s=""; for (const b of new Uint8Array(bytes)) s+=String.fromCharCode(b); return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""); }
function cookieValue(request,name){const raw=request.headers.get("Cookie")||"";const m=raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));return m?decodeURIComponent(m[1]):"";}
function equal(a,b){if(!a||!b||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
async function hmac(text,secret){if(!secret)throw new Error("SESSION_SECRET is not configured.");const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64url(await crypto.subtle.sign("HMAC",key,enc.encode(text)));}
async function derive(password,salt,iterations=ITERATIONS){const key=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:enc.encode(salt),iterations:Math.min(ITERATIONS,Math.max(1,Number(iterations)||ITERATIONS))},key,256);return b64url(bits);}
function cleanName(v,f){return String(v||f).trim().slice(0,80)||f;}
export function defaultConfig(){return{team1:{name:"Apey's Apes",salt:"",hash:"",version:0,iterations:ITERATIONS},team2:{name:"The Harambe Hunters",salt:"",hash:"",version:0,iterations:ITERATIONS},updatedAt:new Date().toISOString()};}
export async function getConfig(env){const raw=await env.DROPS_KV.get(CONFIG_KEY);if(!raw)return defaultConfig();try{const p=JSON.parse(raw),b=defaultConfig();for(const t of ["team1","team2"]){b[t]={...b[t],...(p[t]||{}),name:cleanName(p[t]?.name,b[t].name),iterations:Math.min(ITERATIONS,Math.max(1,Number(p[t]?.iterations)||ITERATIONS)),version:Math.max(0,Number(p[t]?.version)||0)};}b.updatedAt=p.updatedAt||b.updatedAt;return b;}catch{return defaultConfig();}}
export async function saveConfig(env,c){c.updatedAt=new Date().toISOString();await env.DROPS_KV.put(CONFIG_KEY,JSON.stringify(c));}
export async function setPassword(c,team,password){if(!["team1","team2"].includes(team))throw new Error("Invalid team.");password=String(password||"");if(password.length<10)throw new Error("Passwords must be at least 10 characters.");if(password.length>128)throw new Error("Passwords cannot exceed 128 characters.");const salt=b64url(crypto.getRandomValues(new Uint8Array(24)));c[team].salt=salt;c[team].hash=await derive(password,salt);c[team].iterations=ITERATIONS;c[team].version=(Number(c[team].version)||0)+1;}
export async function verifyPassword(c,team,password){const x=c?.[team];if(!x?.salt||!x?.hash)return false;return equal(await derive(String(password||""),x.salt,x.iterations),x.hash);}
export async function makeCookie(team,env,c){const payload=btoa(JSON.stringify({team,version:c[team].version,exp:Date.now()+TTL*1000}));const sig=await hmac(payload,env.SESSION_SECRET);return`${COOKIE}=${encodeURIComponent(payload+"."+sig)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL}`;}
export function clearCookie(){return`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;}
export async function getTeamSession(request,env){const raw=cookieValue(request,COOKIE);const [payload,sig]=raw.split(".");if(!payload||!sig)return null;try{if(!equal(sig,await hmac(payload,env.SESSION_SECRET)))return null;const d=JSON.parse(atob(payload));if(!["team1","team2"].includes(d.team)||Number(d.exp)<Date.now())return null;const c=await getConfig(env);if(!c[d.team].hash||Number(d.version)!==Number(c[d.team].version))return null;return d.team;}catch{return null;}}
export function boardTeam(team){return team==="team1"?"ember":team==="team2"?"ash":null;}
function ip(request){return String(request.headers.get("CF-Connecting-IP")||"unknown").slice(0,80);}
export async function rateStatus(request,env,team){const key=`bingo:team-login:${team}:${ip(request)}`;const n=Number(await env.DROPS_KV.get(key)||0);return{key,allowed:n<MAX_ATTEMPTS};}
export async function failRate(env,key){const n=Number(await env.DROPS_KV.get(key)||0)+1;await env.DROPS_KV.put(key,String(n),{expirationTtl:WINDOW});}
export async function clearRate(env,key){await env.DROPS_KV.delete(key);}
