const HOUR=3600000,DAY=24*HOUR;
const trusted=r=>r&&!r.visibilityOnly&&['verified','mirror'].includes(r.textStatus)&&/^https:\/\/(?:x\.com|twitter\.com)\/thsottiaux\/status\/\d+(?:\?[^\s]*)?$/.test(r.url||'')&&Number.isFinite(Date.parse(r.postedAt));
// Interpret retained original text only. No translation, probability or collection-time inference.
function legacyDirective(record) {
 if(!trusted(record))return null;
 const text=String(record.original||'').replace(/https?:\/\/\S+/g,'').trim(),posted=Date.parse(record.postedAt);
 if(!text||/\?|\b(?:maybe|might|could|should|probably|perhaps|hope|if|unless|would|not|no|never|cannot|tentative|approximately|roughly|assuming|conditional|won't)\b|n['’]t|可能|也许|预计|大概|如果|希望|不会/i.test(text))return null;
 // A reset of a database/device/password is unrelated to Codex usage limits.
 if(/\b(?:database|password|device|router|phone|computer|server)\b|数据库|密码|设备|路由器/i.test(text))return null;
 const scope=record.resetType==='banked'||record.type==='banked'||record.resetTypes?.includes('banked')||/\bbanked\b|重置券/i.test(text)?'banked':'automatic';
 const sentences=text.split(/(?<=[.!。])\s+|[\r\n]+/).map(s=>s.trim().replace(/[.!。]+$/,'')).filter(Boolean);
 const leading='(?:(?:we|i|Codex|the (?:Codex )?limits) (?:will (?:be )?|are )|we[\'’]ll )?reset(?:ting)?';
 const object='(?: (?:(?:all|the|your|everyone[\'’]s) )?(?:Codex )?(?:(?:usage|rate|weekly) )?(?:limits|quotas|credits)| Codex)?';
 const direct=new RegExp('^'+leading+object+' (in .+|on .+|at .+)$','i');
 const passive=/^(?:the )?(?:banked |Codex )?reset (?:will (?:happen|occur|take place)|is scheduled|has been scheduled) (in .+|on .+|at .+|for .+)$/i;
 const candidates=[];
 let terminal=null;
 for(const sentence of sentences){
  // Full statements prevent quoted, conditional and "checking whether" clauses from confirming completion.
  if(/^(?:(?:the )?(?:(?:codex|banked) )?reset (?:is |has been |was )?(?:cancelled|canceled|postponed|delayed)|we (?:have )?(?:cancelled|canceled|postponed|delayed) (?:the |banked )?reset|(?:codex )?重置(?:已)?(?:取消|推迟)|(?:已)?取消(?:了)?(?:codex )?重置)$/.test(sentence.toLowerCase()))terminal={kind:'cancelled',scope};
  if(/^(?:(?:the )?(?:(?:codex|banked) )?reset (?:is |has been )?(?:complete(?:d)?|done|finished)|we have completed (?:the |banked )?reset|(?:codex )?重置已完成|已完成(?:codex )?重置)$/.test(sentence.toLowerCase())||['reset','automatic','banked'].includes(record.category||record.type)&&/^(?:done and dusted|it['’]s done)$/i.test(sentence))terminal={kind:'completed',scope};
  const english=sentence.match(direct)||sentence.match(passive);
  const chinese=sentence.match(/^(?:Codex\s*)?将在\s*(.+?)后重置$/i);
  if(!english&&!chinese)continue;
  const fragment=(english?.[1]||chinese?.[1]).trim();
  const relative=fragment.match(/^in\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)(?:\s*(?:,\s*|and\s+|\s+)(\d+(?:\.\d+)?)\s*(minutes?|mins?|m))?$/i);
  const zh=chinese&&fragment.match(/^(?:(\d+(?:\.\d+)?)\s*小时)?\s*(?:(\d+(?:\.\d+)?)\s*分钟)?$/);
  const absolute=fragment.match(/^(?:on|at|for)\s+(20\d{2})-(\d{2})-(\d{2})(?:T|\s+(?:at\s+)?)(\d{2}):(\d{2})(?::(\d{2}))?\s*(UTC|GMT|Z)$/i);
  if(relative){
   if(relative[3]&&!/^h/i.test(relative[2]))return null;
   candidates.push(posted+Number(relative[1])*(/^h/i.test(relative[2])?HOUR:60000)+Number(relative[3]||0)*60000);
  }else if(zh&&(zh[1]||zh[2]))candidates.push(posted+Number(zh[1]||0)*HOUR+Number(zh[2]||0)*60000);
  else if(absolute){
   const [year,month,day,hour,minute,second]=absolute.slice(1,7).map(x=>Number(x||0));
   const value=Date.UTC(year,month-1,day,hour,minute,second),date=new Date(value);
   if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day||hour>23||minute>59||second>59)return null;
   candidates.push(value);
  }else return null;
 }
 if(terminal)return candidates.length?null:terminal;
 if(candidates.length!==1||!Number.isFinite(candidates[0])||candidates[0]<=posted||candidates[0]-posted>7*DAY)return null;
 return {kind:'scheduled',scope,scheduledAt:new Date(candidates[0]).toISOString(),basis:'original-explicit-time'};
}

const content=p=>String(p?.original??p?.text??'').replace(/https?:\/\/\S+/g,'').trim();
const unrelated=/\b(?:database|password|device|router|phone|computer|server)\b|数据库|密码|设备|路由器/i;
const unsure=/\?|[？]|\b(?:maybe|might|could|should|probably|perhaps|hope|if|unless|would|not|no|never|cannot|tentative|approximately|roughly|assuming|conditional|won't|whether|once)\b|n['’]t|可能|也许|预计|大概|如果|希望|不会/i;
export function tiboReplyContext(post,{parent}={}){
 const text=content(post),to=String(post?.replyingTo??post?.replying_to??'').replace(/^@/,'').toLowerCase(),mention=text.match(/^@(\w+)/)?.[1]?.toLowerCase();
 const reply=post?.isReply===true||post?.is_reply===true||Boolean(to)||Boolean(mention);
 if((to&&to!=='thsottiaux')||(mention&&mention!=='thsottiaux')||reply&&!to&&!mention)return {selfReply:false,reason:'reply_to_other'};
 const selfReply=reply&&(to==='thsottiaux'||mention==='thsottiaux');
 if(selfReply&&!parent&&!/\breset(?:s|ting)?\b|重置/i.test(text))return {selfReply,reason:'parent_missing'};
 return {selfReply,reason:null};
}
const zoneFormatters=new Map();
function localParts(at,zone){if(!zoneFormatters.has(zone))zoneFormatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));return Object.fromEntries(zoneFormatters.get(zone).formatToParts(at).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));}
function localInstant(date,hour,minute,zone){
 const target=Date.UTC(date.year,date.month-1,date.day,hour,minute);let guess=target;
 for(let i=0;i<4;i++){const p=localParts(guess,zone),delta=target-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);if(!delta)return guess;guess+=delta;}
 return NaN; // Nonexistent local clock time at a DST transition.
}
function moveDate(date,days){const d=new Date(Date.UTC(date.year,date.month-1,date.day+days));return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()};}
export function classifyTiboPost(post,{parent,providerKind=post?.providerKind,explicitResetClaim=post?.explicitResetClaim}={}){
 if(!post||post.visibilityOnly)return null;
 const reply=tiboReplyContext(post,{parent});if(reply.reason)return null;
 const text=content(post).replace(/^@thsottiaux\s*/i,''),parentText=reply.selfReply?content(parent):'',posted=Date.parse(post.postedAt??post.at);
 if(!text||!Number.isFinite(posted)||unrelated.test(text)||unrelated.test(parentText))return null;
 const combined=text+' '+parentText,scope=/\bbanked\b|\breset credits?\b|重置券/i.test(combined)||post.resetType==='banked'||post.type==='banked'||post.resetTypes?.includes('banked')||parent?.resetType==='banked'?'banked':'automatic';
 const related=/\breset(?:s|ting)?\b|\breseting\b|重置/i.test(combined);
 const sentences=text.split(/(?<=[.!?。！？])(?:\s+|$)|[\r\n]+/).map(s=>s.trim().replace(/[.!。]+$/,'')).filter(Boolean);
 const plans=[];let completed=false,commitment=false;
 for(const sentence of sentences){
  if(unsure.test(sentence)||/\b(?:database|password|device|router|phone|computer|server|or|discuss|reports|button|lost)\b/i.test(sentence))continue;
  if(/^(?:done and dusted|it['’]s done|it is done|(?:the )?(?:codex |banked )?resets? (?:is |has been |was )?(?:complete(?:d)?|done|finished)|we have completed (?:the |banked )?reset|resets? (?:all )?propagated|all propagated|reset has been propagated|all reset for everyone|confirmed landed across all accounts|put the reset in the bag|(?:codex )?重置已完成|已完成(?:codex )?重置)$/i.test(sentence)){completed=true;continue;}
  const intent=related&&(/\breset(?:s|ting)?\b|\breseting\b/i.test(sentence)||reply.selfReply&&/^(?:landing|will (?:land|be there))/i.test(sentence))&&!/\bcomplete(?:d)?\b/i.test(sentence);
  if(!intent)continue;
  let target=null,approximate=false;
  const absolute=sentence.match(/\b(?:on|at|for)\s+(20\d{2})-(\d{2})-(\d{2})(?:T|\s+(?:at\s+)?)(\d{2}):(\d{2})(?::(\d{2}))?\s*(UTC|GMT|Z)$/i);
  const relative=sentence.match(/\b(?:within(?: the next)?|in(?: the next)?)\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)(?:\s*(?:,\s*|and\s+|\s+)(\d+(?:\.\d+)?)\s*(minutes?|mins?|m))?$/i);
  if(absolute){
   const [year,month,day,hour,minute,second]=absolute.slice(1,7).map(x=>Number(x||0)),value=Date.UTC(year,month-1,day,hour,minute,second),d=new Date(value);
   if(d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day&&hour<24&&minute<60&&second<60)target=value;
  }else if(relative&&!/\bcomplete(?:d)?\b/i.test(sentence)){
   if(relative[3]&&!/^h/i.test(relative[2]))continue;
   target=posted+Number(relative[1])*(/^h/i.test(relative[2])?HOUR:60000)+Number(relative[3]||0)*60000;approximate=true;
  }else{
   const zone=/\b(?:UTC|GMT)\b/i.test(sentence)?'UTC':'America/Los_Angeles';
   if(/\bby (?:EOD|end of (?:the )?day)\b/i.test(sentence)){
    const date=localParts(posted,zone);target=localInstant(date,23,59,zone);if(target<=posted)target=localInstant(moveDate(date,1),23,59,zone);approximate=true;
   }else{
    const clock=sentence.match(/\b(?:(today|tomorrow)\s+(?:at\s+)?|(?:will land |landing |will be there )?(at|by)\s+)(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b(?:\s+(?:PST|PDT|PT|UTC|GMT))?/i);
    if(clock){const date=localParts(posted,zone),hour=Number(clock[3]),minute=Number(clock[4]||0);if(hour>=1&&hour<=12&&minute<60){const h=hour%12+(clock[5].toLowerCase()==='pm'?12:0),days=clock[1]?.toLowerCase()==='tomorrow'?1:0;target=localInstant(moveDate(date,days),h,minute,zone);if(target<=posted&&!clock[1])target=localInstant(moveDate(date,1),h,minute,zone);approximate=clock[2]?.toLowerCase()==='by';}}
   }
  }
  if(Number.isFinite(target)&&target>posted&&target-posted<=7*DAY){plans.push({kind:'plan',scheduledAt:new Date(target).toISOString(),approximate,scope});continue;}
  if(sentences.length===1&&/^(?:day \d+\s*\/\s*)?reset$/i.test(sentence)||/\bglobal reset (?:landing|by)\b|\bwe['’]ll reset (?:usage )?limits\b|\bwe (?:will reset|are reset(?:t)?ing)\b|\breset will (?:land|be there)\b/i.test(sentence)||((providerKind==='signal'||explicitResetClaim===true)&&/\breset(?:s|ting)?\b/i.test(sentence)&&!/\b(?:complete|propagated|cancelled|canceled|delayed|postponed)\b/i.test(sentence)))commitment=true;
 }
 if(completed)return plans.length?null:{kind:'completed',scope};
 if(plans.length)return plans.length===1&&!/\btiming is tentative\b|\bassuming\b/i.test(text)?plans[0]:null;
 return commitment?{kind:'commitment',scope}:null;
}
export function interpretResetDirective(record){
 const reply=tiboReplyContext(record,{parent:record?.parent});
 if(!trusted(record)||reply.reason||reply.selfReply&&unrelated.test(content(record.parent)))return null;
 const found=classifyTiboPost(record,{parent:record.parent});
 if(found?.kind==='plan')return {...found,kind:'scheduled',basis:'original-explicit-time'};
 if(found?.kind==='completed')return found;
 const legacy=legacyDirective(record);
 return legacy&&reply.selfReply&&/\bbanked\b|\breset credits?\b|重置券/i.test(content(record.parent))?{...legacy,scope:'banked'}:legacy;
}

export function annotateResetPlan(record) {
 if(!record||typeof record!=='object')return record;
 if(record.visibilityOnly)return {...record,category:'post',resetType:'unknown',resetTypes:[],resetAt:null,scheduledAt:null};
 const directive=interpretResetDirective(record);
 if(directive?.kind==='scheduled')return {...record,category:'schedule',scheduledAt:directive.scheduledAt,approximate:directive.approximate===true,resetAt:null,resetType:directive.scope,resetTypes:[directive.scope]};
 if(directive?.kind==='cancelled')return {...record,category:'post',scheduledAt:null,resetAt:null};
 if(directive?.kind==='completed')return {...record,category:'reset',completionNotice:true,scheduledAt:null,resetType:directive.scope,resetTypes:[...new Set([...(Array.isArray(record.resetTypes)?record.resetTypes:[]).filter(t=>['automatic','banked'].includes(t)),directive.scope])]};
 if(record.category==='schedule')return {...record,category:directive?.kind==='completed'?'reset':'post',scheduledAt:null};
 return record;
}

export function normalizeResetConfirmation(value,now=Date.now()) {
 if(!value||value.kind!=='reset'||value.state!=='confirmed'||!/^\d{15,22}$/.test(value.id||'')||!['operator_observed','tibo_confirmed'].includes(value.confirmationSource))return null;
 const at=Date.parse(value.sourceAt),evidenceAt=Date.parse(value.confirmationSource==='operator_observed'?value.observedAt:value.confirmedAt);
 const link=typeof value.url==='string'&&value.url.match(/^https:\/\/(?:x\.com|twitter\.com)\/thsottiaux\/status\/(\d{15,22})$/);
 if(!Number.isFinite(at)||at>now||!Number.isFinite(evidenceAt)||evidenceAt>now||link?.[1]!==value.id)return null;
 if(value.confirmationSource==='tibo_confirmed'&&!/^https:\/\/(?:x\.com|twitter\.com)\/thsottiaux\/status\/\d{15,22}$/.test(value.confirmationUrl||''))return null;
 return Object.fromEntries(['id','kind','state','sourceAt','url','summary','confirmationSource','observedAt','confirmedAt','confirmationUrl'].filter(k=>value[k]!=null).map(k=>[k,value[k]]));
}

export const resetEvidenceAt=value=>Date.parse(value?.confirmationSource==='operator_observed'?value.observedAt:value?.confirmationSource==='tibo_confirmed'?value.confirmedAt:value?.sourceAt);
export function preferResetConfirmation(previous,incoming,now=Date.now()){
 const old=normalizeResetConfirmation(previous,now),next=normalizeResetConfirmation(incoming,now);
 if(!old)return next;if(!next)return old;
 if(old.id===next.id&&old.confirmationSource!==next.confirmationSource)return old.confirmationSource==='tibo_confirmed'?old:next;
 return resetEvidenceAt(next)>=resetEvidenceAt(old)?next:old;
}
function evidenceMatchesPlan(evidence,record){
 const parent=tiboReplyContext(record,{parent:record.parent}).selfReply&&(record.inReplyToId||record.parent?.id);
 return (evidence.id===record.id||evidence.id===parent)&&resetEvidenceAt(evidence)>=Date.parse(record.postedAt);
}
// Keep a durable identity across the observation and a later confirmation of the same plan.
export function completionPlanId(event,records=[],now=Date.now()){
 const directive=event.kind==='reset'?null:interpretResetDirective(event);
 if(event.kind!=='reset'&&directive?.kind!=='completed')return;
 const plans=records.filter(r=>Date.parse(r.postedAt)<=now&&now-Date.parse(r.postedAt)<7*DAY).map(record=>({record,directive:interpretResetDirective(record)})).filter(p=>p.directive?.kind==='scheduled').sort((a,b)=>Date.parse(b.record.postedAt)-Date.parse(a.record.postedAt));
 if(event.kind==='reset')return plans.find(p=>evidenceMatchesPlan(event,p.record))?.record.id;
 const explicitParent=tiboReplyContext(event,{parent:event.parent}).selfReply&&(event.inReplyToId||event.parent?.id);
 return plans.find(p=>p.directive.scope===directive.scope&&Date.parse(p.record.postedAt)<Date.parse(event.postedAt)&&(!explicitParent||[p.record.id,p.record.inReplyToId,p.record.parent?.id].includes(explicitParent)))?.record.id;
}

export function getResetPlanState(records=[],now=Date.now(),providerConfirmation=null) {
 const items=records.filter(r=>Date.parse(r.postedAt)<=now).map(record=>({record,directive:interpretResetDirective(record)})).filter(x=>x.directive).sort((a,b)=>Date.parse(b.record.postedAt)-Date.parse(a.record.postedAt));
 const plan=items.find(x=>x.directive.kind==='scheduled'&&now-Date.parse(x.record.postedAt)<7*DAY);
 if(!plan)return null;
 const target=Date.parse(plan.directive.scheduledAt);
 const confirmation=items.find(x=>['completed','cancelled'].includes(x.directive.kind)&&x.directive.scope===plan.directive.scope&&Date.parse(x.record.postedAt)>Date.parse(plan.record.postedAt));
 if(confirmation&&now-Date.parse(confirmation.record.postedAt)>DAY||!confirmation&&now-target>DAY)return null;
 const evidence=normalizeResetConfirmation(providerConfirmation,now),observation=evidence&&evidenceMatchesPlan(evidence,plan.record)?evidence:null;
 const phase=confirmation?.directive.kind||(observation?(observation.confirmationSource==='operator_observed'?'observed':'completed'):(now>=target?'awaiting':'scheduled'));
 return {record:plan.record,scheduledAt:plan.directive.scheduledAt,approximate:plan.directive.approximate===true,phase,remainingMs:phase==='scheduled'?Math.max(0,target-now):0,confirmation:confirmation?.record||null,observation};
}

export function isCurrentPlanNotice(record,records,now,providerConfirmation=null) {
 const current=annotateResetPlan(records.find(r=>r.id===record.id)||record);
 const directive=interpretResetDirective(current);
 if(directive?.kind==='cancelled')return false;
 if(directive?.kind!=='scheduled')return record.category!=='schedule'&&current.category!=='post'&&current.category!=='forecast';
 // Pre-feature generic snapshots cannot safely describe a newly recognized plan.
 if(!record.scheduledAt)return false;
 const state=getResetPlanState(records,now,providerConfirmation);
 return state?.phase==='scheduled'&&state.record.id===record.id&&state.scheduledAt===(record.scheduledAt||directive.scheduledAt);
}

export function resetNoticeKey(record){const d=interpretResetDirective(record);return 'reset:'+record.id+(d?.kind==='scheduled'?':plan:'+d.scheduledAt:'');}

export function formatPlanCountdown(milliseconds) {
 const seconds=Math.max(0,Math.ceil(milliseconds/1000));
 return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(v=>String(v).padStart(2,'0')).join(':');
}
