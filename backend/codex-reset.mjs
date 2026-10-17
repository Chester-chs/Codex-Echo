import {load} from 'cheerio';
export const CODEX_RESET='https://codex-reset.com';
export const CODEX_RESET_UA='codex-echo-radar/1.0 (+https://echo-radar.pages.dev)';
const caches=new WeakMap();
const validTime=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const iso=v=>new Date(v).toISOString();
const bad=()=>{throw new Error('Invalid codex-reset schema');};
const text=v=>typeof v==='string'&&v.trim()&&v.length<=100000;
function identity(id,url){if(typeof id!=='string'||typeof url!=='string'||!/^\d{15,22}$/.test(id)||!new RegExp('^https://(?:x\\.com|twitter\\.com)/thsottiaux/status/'+id+'(?:\\?[^\\s]*)?$').test(url))bad();return `https://x.com/thsottiaux/status/${id}`;}
// Decode entities as text only: never parse provider text as executable markup.
function entities(value){return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,m=>load('<span>'+m+'</span>')('span').text());}
function base(id,url,postedAt){return {id,url:identity(id,url),postedAt:iso(postedAt),timeBasis:'api',resetAt:null,resetType:'unknown',author:'Tibo · @thsottiaux',translation:''};}
export function parseCodexResetFeed(json,now=Date.now()){
 const n=typeof now==='string'?Date.parse(now):now;
 if(json?.source!=='x-api'||json.stale===true||!validTime(json.fetched_at)||Date.parse(json.fetched_at)>n+60000||n-Date.parse(json.fetched_at)>1800000||!Array.isArray(json.tweets))bad();
 const records=json.tweets.map(p=>{
  if(!validTime(p.at)||Date.parse(p.at)>n+60000||!text(p.text)||typeof p.kind!=='string'||typeof p.explicit_reset_claim!=='boolean'||typeof p.is_reply!=='boolean')bad();
  return {...base(p.id,p.url,p.at),original:entities(p.text),category:'post',textStatus:'mirror',textSource:CODEX_RESET+'/api/feed',isReply:p.is_reply,replyingTo:typeof p.replying_to==='string'?p.replying_to:null,inReplyToId:p.in_reply_to_tweet_id||null,conversationId:p.conversation_id||null,providerKind:p.kind,explicitResetClaim:p.explicit_reset_claim};
 });
 // Optional, undocumented context must never invalidate the announcement feed.
 const seen=new Set(records.map(r=>r.id));
 for(const p of Array.isArray(json.radar_context)?json.radar_context.slice(0,100):[]){
  try{
   if(p?.visibility_only!==true||p.display_kind!=='context'||!validTime(p.at)||Date.parse(p.at)>n+60000||!text(p.text)||seen.has(p.id))continue;
   records.push({...base(p.id,p.url,p.at),original:entities(p.text),category:'post',visibilityOnly:true,textStatus:'mirror',textSource:CODEX_RESET+'/api/feed'});seen.add(p.id);
  }catch{/* Ignore invalid optional context independently. */}
 }
 return records;
}
export function parseCodexResetArchive(html,now=Date.now()){
 const $=load(html),records=[],seen=new Set(),n=typeof now==='string'?Date.parse(now):now;
 // Public text archive only; do not execute scripts or infer reset facts from badges.
 $('article.tx-row').slice(0,200).each((_,element)=>{
  const row=$(element),url=row.find('a.tx-time').attr('href'),id=row.attr('id')?.match(/^p(\d{15,22})$/)?.[1],at=row.find('a.tx-time time').attr('datetime');
  const paragraph=row.find('.tx-card > .tx-text').first().clone();paragraph.find('br').replaceWith('\n');const original=paragraph.text().trim();
  try{if(seen.has(id)||!validTime(at)||Date.parse(at)>n+60000||!text(original))return;
   records.push({...base(id,url,at),original,category:'post',visibilityOnly:true,textStatus:'mirror',textSource:CODEX_RESET+'/tibo/x',isReply:row.attr('data-reply')==='1'});seen.add(id);
  }catch{/* A malformed post must not hide other archived posts. */}
 });
 if(!records.length)throw new Error('Public Tibo archive markup changed or empty');return records;
}
export function parseCodexResetTimeline(json){
 if(!Array.isArray(json?.events))bad();
 return json.events.filter(p=>p.type==='reset'&&p.confirmed===true&&p.scope==='global').map(p=>{
  if(!validTime(p.announced_at)||p.effective_at!=null&&!validTime(p.effective_at)||typeof p.banked_grant!=='boolean'||!text(p.summary)||!['live','archive','operator-observed'].includes(p.source))bad();
  return {...base(p.id,p.url,p.announced_at),category:'reset',resetType:p.banked_grant?'banked':'automatic',resetAt:p.effective_at?iso(p.effective_at):null,original:'',context:entities(p.summary),textStatus:'missing',textSource:CODEX_RESET+'/api/timeline',confirmationSource:p.source,confirmed:true};
 });
}
export function parseLatestAlert(json,{log=x=>console.log(JSON.stringify(x))}={}){
 if(!json||!Object.hasOwn(json,'latest_alert'))bad();const p=json.latest_alert;if(p===null)return null;if(!p||typeof p!=='object'||Array.isArray(p))bad();
 // Only this pair is present in the public API snapshot. Strong Watches lack a stable documented schema.
 if(p.kind!=='reset'||p.state!=='confirmed'){log({event:'codex_reset_alert_ignored',kind:p.kind??null,state:p.state??null});return null;}
 if(!validTime(p.source_at)||!text(p.summary)||!['operator_observed','tibo_confirmed'].includes(p.confirmation_source)||p.observation_message!=null&&!text(p.observation_message)||p.observed_at!=null&&!validTime(p.observed_at)||p.confirmed_at!=null&&!validTime(p.confirmed_at))bad();
 if(p.confirmation_source==='operator_observed'&&!validTime(p.observed_at))bad();
 if(p.confirmation_source==='tibo_confirmed'&&(!validTime(p.confirmed_at)||!p.confirmation_url))bad();
 const url=identity(p.id,p.url);if(p.confirmation_url)identity(p.confirmation_url.match(/status\/(\d+)/)?.[1],p.confirmation_url);
 return {id:p.id,kind:p.kind,state:p.state,sourceAt:iso(p.source_at),url,summary:entities(p.summary),observationMessage:p.observation_message?entities(p.observation_message):'',confirmationSource:p.confirmation_source,observedAt:p.observed_at?iso(p.observed_at):null,confirmedAt:p.confirmed_at?iso(p.confirmed_at):null,confirmationUrl:p.confirmation_url||null};
}
export async function fetchCodexReset(path,{fetcher=fetch,now=Date.now()}={}){
 if(!['/api/feed','/api/forecast','/api/timeline','/tibo/x'].includes(path))throw new Error('Unsupported codex-reset endpoint');
 let cache=caches.get(fetcher);if(!cache){cache=new Map();caches.set(fetcher,cache);}const entry=cache.get(path);
 if(entry&&now<entry.expires&&now>=entry.at)return structuredClone(await entry.promise);
 const promise=(async()=>{
  const r=await fetcher(CODEX_RESET+path,{headers:{'User-Agent':CODEX_RESET_UA},signal:AbortSignal.timeout(15000),redirect:'manual'});
  if(!r.ok){const error=new Error('HTTP '+r.status);if(r.status===429){const raw=r.headers.get('Retry-After'),delay=/^\d+$/.test(raw||'')?Number(raw)*1000:Date.parse(raw)-now;error.retryAt=now+Math.min(86400000,Math.max(60000,Number.isFinite(delay)?delay:60000));const active=cache.get(path);if(active)active.expires=error.retryAt;}throw error;}if(Number(r.headers.get('Content-Length'))>3000000)throw new Error('Response too large');
  let size=0,body='';const decoder=new TextDecoder();for await(const chunk of r.body){size+=chunk.byteLength;if(size>3000000)throw new Error('Response too large');body+=decoder.decode(chunk,{stream:true});}body+=decoder.decode();return path==='/tibo/x'?body:JSON.parse(body);
 })();cache.set(path,{at:now,expires:now+60000,promise});return structuredClone(await promise);
}
