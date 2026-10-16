import {load} from 'cheerio';
import {BUILDERS_FEED,parseBuilderFeed} from './tweets.mjs';
import {annotateResetPlan} from '../src/lib/reset-plan.mjs';

export const RADAR = 'https://codex-reset.aiplanwatch.com';
export const TOKEN = 'https://tokenusage.dev/api/resets';
// Reviewed against the linked original posts. These are announcement types, not completion evidence.
const reviewedAnnouncements = {
 '2076735790567338203':{category:'reset',resetType:'banked'},
 '2076418567143408112':{category:'reset',resetType:'banked'},
 '2090947107469558188':{category:'reset',resetType:'banked'},
 '2097043464538264003':{category:'reset',resetType:'automatic'},
 '2094144275957350900':{category:'reset',resetType:'automatic'},
 '2071740419030053227':{category:'reset',resetType:'automatic',resetTypes:['automatic','banked']},
 '2067399435009622521':{category:'reset',resetType:'automatic',resetTypes:['automatic','banked']},
 '2105120226027450685':{category:'forecast',resetType:'unknown',classificationNote:'The source linked this reply to a reset, but the retained text alone does not confirm a reset announcement.',classificationNoteZh:'来源将这条回复关联到重置，但仅凭当前原文无法确认它是一条重置公告。'},
};
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
export const postId = url => typeof url === 'string' ? url.match(/^https:\/\/(?:x\.com|twitter\.com)\/(?:thsottiaux|i)\/status\/(\d{15,22})(?:\?[^\s]*)?$/)?.[1] : null;
function postTime(id) {
 try { return new Date(Number((BigInt(id) >> 22n) + 1288834974657n)).toISOString(); } catch { return null; }
}
function plain($, element) {
 const copy=$(element).clone(); copy.find('br').replaceWith('\n');
 return copy.text().trim().replace(/\r/g,'');
}
function base(url,original,observedAt) {
 const id=postId(url);
 return {id,url,postedAt:postTime(id),timeBasis:'post-id',detectedAt:iso(observedAt),resetAt:null,resetType:'unknown',category:'reset',original,author:'Tibo · @thsottiaux',textStatus:original?'source-copy':'missing',textSource:RADAR,translation:''};
}
function nextPage($,path) {
 const href=$('a').toArray().map(el=>$(el).attr('href')).find(v=>v?.startsWith(path+'?')&&v.includes('cursor='));
 return href ? new URL(href,RADAR).href : null;
}
export function parseHistory(html,observedAt) {
 const $=load(html), records=[];
 $('article.event').each((_,el)=>{
  const e=$(el),url=e.find('a[data-radar-source="reset"]').attr('href');
  if(!postId(url))return;
  const record=base(url,plain($,e.find('blockquote')),observedAt);
  const type=e.find('h3').text().trim();
  record.resetType=type==='Global reset'?'automatic':type==='Banked reset'?'banked':'unknown';
  records.push(record);
 });
 if(!records.length)throw new Error('History markup changed or empty');
 return {records,next:nextPage($,'/history')};
}
export function parseTimeline(html) {
 const $=load(html),records=[];
 $('article.post').each((_,el)=>{
  const e=$(el),a=e.find('a[data-radar-source="tibo"]'),url=a.attr('href');
  if(!postId(url))return;
  const text=plain($,e.find('.post-main > p').first());
  const record=base(url,text,e.find('time').attr('datetime'));
  record.category=a.attr('data-radar-content')==='forecast'?'forecast':'reset';
  if(/^Inferred forecast:/i.test(text)){record.original='';record.context=text;record.textStatus='missing';}
  records.push(record);
 });
 if(!records.length)throw new Error('Timeline markup changed or empty');
 return {records,next:nextPage($,'/tibo')};
}
// Read only public serialized component props; never execute source scripts.
export function parseWatch(html,checkedAt) {
 const $=load(html); let raw=null;
 function walk(v,depth=0){if(!v||typeof v!=='object'||depth>100)return;
  if(v.forecast?.mode==='watch')raw=v.forecast;
  for(const child of Object.values(v))walk(child,depth+1);
 }
 let stream='';
 $('script').each((_,el)=>{const s=$(el).text();const m=s.match(/^self\.__next_f\.push\((\[[\s\S]*\])\);?$/);if(!m)return;try{const x=JSON.parse(m[1]);if(x[0]===1&&typeof x[1]==='string')stream+=x[1];}catch{}});
 for(const line of stream.split('\n')){const index=line.indexOf(':');if(index<0)continue;try{walk(JSON.parse(line.slice(index+1)));}catch{}}
 if(!raw){if($('[data-forecast-mode="watch"][data-forecast-status="ready"]').length)throw new Error('Watch data schema changed');return null;}
 const w=raw.watch,until=iso(w?.expiresAt),recordedAt=iso(w?.observedAt);
 if(raw.status!=='ready'||!w||!postId(w.sourceUrl)||!until||!recordedAt||!Number.isFinite(w.probability)||w.probability<0||w.probability>100||!w.sourceText?.trim()||!w.windowText?.trim())throw new Error('Invalid watch fields');
 if(Date.parse(until)<=Date.parse(checkedAt)||Date.parse(recordedAt)>Date.parse(checkedAt))return null;
 return {id:`watch:${postId(w.sourceUrl)}:${until}`,kind:'source-watch',probability:w.probability,windowText:w.windowText,windowStart:null,windowEnd:null,sourceUrl:w.sourceUrl,providerUrl:RADAR,provider:'AIPlanWatch',basis:w.sourceText,publishedAt:recordedAt,timeBasis:'source-recorded',validUntil:until,checkedAt,sourceFreshUntil:new Date(Date.parse(checkedAt)+30*60000).toISOString()};
}
export function parseOEmbed(payload,url) {
 if(!payload||!/^https:\/\/(?:x\.com|twitter\.com)\/thsottiaux\/?$/.test(payload.author_url)||postId(payload.url)!==postId(url))throw new Error('Unexpected embed identity');
 const $=load(payload.html||''),p=$('blockquote > p').first();
 const original=plain($,p);if(!original)throw new Error('Embed has no original');
 const withoutLinks=original.replace(/https?:\/\/\S+/g,'').trim();
 return {original,textStatus:/(?:…|\.\.\.)$/.test(withoutLinks)?'truncated':'verified',textSource:'https://publish.x.com/oembed'};
}
export function parseFxEmbed(payload,url) {
 const post=payload?.tweet;
 if(payload?.code!==200||post?.id!==postId(url)||post?.author?.screen_name!=='thsottiaux')throw new Error('Unexpected mirror identity');
 const original=post.raw_text?.text||post.text;
 if(typeof original!=='string'||!original.trim()||original.length>100000)throw new Error('Invalid mirror text');
 return {original,textStatus:'mirror',textSource:'https://api.fxtwitter.com'};
}
export function mergeRecords(...groups) {
 const map=new Map();
 for(const record of groups.flat()){
  if(!record?.id)continue;
  const previous=map.get(record.id);if(!previous){map.set(record.id,{...record});continue;}
  const rank={missing:0,'source-copy':1,truncated:2,community:2,mirror:3,verified:4};
  const prefer=(rank[record.textStatus]||0)>(rank[previous.textStatus]||0)||((rank[record.textStatus]||0)===(rank[previous.textStatus]||0)&&record.original?.length>previous.original?.length);
  const retainedMention=record.original?.startsWith('@')&&record.original.replace(/^(?:@\w+\s+)+/,'')===previous.original;
  const original=prefer||retainedMention?record.original:previous.original;
  const category=['reset','forecast','post'].find(kind=>[previous.category,record.category].includes(kind))||'post';
  const translation=record.original===original&&record.translation?record.translation:previous.original===original?previous.translation||'':'';
  map.set(record.id,{...previous,...record,resetType:record.resetType==='unknown'?previous.resetType:record.resetType,category,original,translation,textStatus:prefer?record.textStatus:previous.textStatus,textSource:prefer?record.textSource:previous.textSource,postedAt:previous.timeBasis==='api'?previous.postedAt:record.postedAt,timeBasis:previous.timeBasis==='api'?'api':record.timeBasis,detectedAt:record.detectedAt||previous.detectedAt});
 }
 return [...map.values()].map(record=>annotateResetPlan(postId(record.url)===record.id&&reviewedAnnouncements[record.id]?{...record,...reviewedAnnouncements[record.id],classificationBasis:'reviewed-original'}:record));
}
export async function fetchText(url,{fetcher=fetch,headers={}}={}) {
 const response=await fetcher(url,{headers:{'User-Agent':'PulseRadar/0.2 (public-source-monitor)',...headers},signal:AbortSignal.timeout(15000),redirect:'manual'});
 if(!response.ok)throw new Error(`Upstream HTTP ${response.status}`);
 if(Number(response.headers.get('content-length'))>3_000_000)throw new Error('Upstream response too large');
 let size=0; const chunks=[],decoder=new TextDecoder();
 for await(const chunk of response.body){size+=chunk.length;if(size>3_000_000)throw new Error('Upstream response too large');chunks.push(decoder.decode(chunk,{stream:true}));}
 return chunks.join('')+decoder.decode();
}
export async function collectPublicSources({fetcher=fetch,now=new Date().toISOString(),backfill=false}={}) {
 const sources=[],groups=[];let forecast;
 const request=url=>fetchText(url,{fetcher});
 const results=await Promise.allSettled([
  (async()=>{const p=JSON.parse(await request(TOKEN));if(!Array.isArray(p.resets))throw new Error('Invalid reset API');return p.resets.filter(x=>postId(x.url)&&iso(x.postedAt)).map(x=>({...base(x.url,'',x.detectedAt),postedAt:iso(x.postedAt),timeBasis:'api',resetType:['automatic','banked'].includes(x.resetType)?x.resetType:'unknown'}));})(),
  (async()=>{let url=RADAR+'/history',all=[];for(let i=0;url&&i<(backfill?8:1);i++){const page=parseHistory(await request(url),now);all.push(...page.records);url=page.next;}return all;})(),
  (async()=>{let url=RADAR+'/tibo',all=[];for(let i=0;url&&i<(backfill?8:1);i++){const page=parseTimeline(await request(url));all.push(...page.records);url=page.next;}return all;})(),
  (async()=>parseWatch(await request(RADAR+'/'),now))(),
  (async()=>parseBuilderFeed(JSON.parse(await request(BUILDERS_FEED)),now))()
 ]);
 const names=['tokenusage','history','timeline','watch','builders'];
 results.forEach((r,i)=>{sources.push({name:names[i],status:r.status==='fulfilled'?'ok':'error',checkedAt:now});if(r.status==='fulfilled'){if(i===3)forecast=r.value;else groups.push(r.value);}else console.warn(JSON.stringify({event:'source_error',source:names[i],message:String(r.reason?.message||'Unknown error').slice(0,180)}));});
 return {records:mergeRecords(...groups),forecast,sources,checkedAt:now};
}
export async function enrichOriginal(record,{fetcher=fetch,bearer='',mirror=true,now=new Date().toISOString()}={}) {
 if(!postId(record.url))throw new Error('Invalid post URL');
 if(bearer){
  const url=`https://api.x.com/2/tweets/${record.id}?tweet.fields=created_at,note_tweet,author_id&expansions=author_id&user.fields=username`;
  const payload=JSON.parse(await fetchText(url,{fetcher,headers:{Authorization:`Bearer ${bearer}`}}));
  const item=payload.data,author=payload.includes?.users?.find(x=>x.id===item?.author_id);
  if(item?.id!==record.id||author?.username!=='thsottiaux')throw new Error('Unexpected post identity');
  const original=item.note_tweet?.text||item.text;
  if(!original)throw new Error('No post text');
  return {...record,original,translation:original===record.original?record.translation||'':'',translationCheckedAt:original===record.original?record.translationCheckedAt:null,textStatus:'verified',textSource:'https://api.x.com/2/tweets',postedAt:iso(item.created_at)||record.postedAt,timeBasis:iso(item.created_at)?'api':record.timeBasis,textCheckedAt:now};
 }
 let text,embedError;
 try{
  const payload=JSON.parse(await fetchText('https://publish.x.com/oembed?omit_script=true&dnt=true&url='+encodeURIComponent(record.url),{fetcher}));
  text=parseOEmbed(payload,record.url);
  if(record.original?.replace(/^(?:@\w+\s+)+/,'')===text.original)text.original=record.original;
 }catch(e){embedError=e;}
 if(mirror&&(!text||text.textStatus==='truncated')){
  try{const payload=JSON.parse(await fetchText(`https://api.fxtwitter.com/thsottiaux/status/${record.id}`,{fetcher}));text=parseFxEmbed(payload,record.url);}catch{}
 }
 if(!text)throw embedError||new Error('Original unavailable');
 if(text.textStatus==='truncated'&&record.original.length>text.original.length)return {...record,textCheckedAt:now};
 return {...record,...text,translation:text.original===record.original?record.translation||'':'',translationCheckedAt:text.original===record.original?record.translationCheckedAt:null,textCheckedAt:now};
}
