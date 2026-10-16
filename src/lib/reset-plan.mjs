const HOUR=3600000,DAY=24*HOUR;
const trusted=r=>r&&['verified','mirror'].includes(r.textStatus)&&/^https:\/\/(?:x\.com|twitter\.com)\/thsottiaux\/status\/\d+(?:\?[^\s]*)?$/.test(r.url||'')&&Number.isFinite(Date.parse(r.postedAt));
// Interpret retained original text only. No translation, probability or collection-time inference.
export function interpretResetDirective(record) {
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

export function annotateResetPlan(record) {
 if(!record||typeof record!=='object')return record;
 const directive=interpretResetDirective(record);
 if(directive?.kind==='scheduled')return {...record,category:'schedule',scheduledAt:directive.scheduledAt,resetAt:null,resetType:directive.scope,resetTypes:[directive.scope]};
 if(directive?.kind==='cancelled')return {...record,category:'post',scheduledAt:null,resetAt:null};
 if(directive?.kind==='completed')return {...record,category:'reset',scheduledAt:null,resetType:directive.scope,resetTypes:[...new Set([...(Array.isArray(record.resetTypes)?record.resetTypes:[]).filter(t=>['automatic','banked'].includes(t)),directive.scope])]};
 if(record.category==='schedule')return {...record,category:directive?.kind==='completed'?'reset':'post',scheduledAt:null};
 return record;
}

export function getResetPlanState(records=[],now=Date.now()) {
 const items=records.filter(r=>Date.parse(r.postedAt)<=now).map(record=>({record,directive:interpretResetDirective(record)})).filter(x=>x.directive).sort((a,b)=>Date.parse(b.record.postedAt)-Date.parse(a.record.postedAt));
 const plan=items.find(x=>x.directive.kind==='scheduled'&&now-Date.parse(x.record.postedAt)<7*DAY);
 if(!plan)return null;
 const target=Date.parse(plan.directive.scheduledAt);
 const confirmation=items.find(x=>['completed','cancelled'].includes(x.directive.kind)&&x.directive.scope===plan.directive.scope&&Date.parse(x.record.postedAt)>Date.parse(plan.record.postedAt));
 if(confirmation&&now-Date.parse(confirmation.record.postedAt)>DAY||!confirmation&&now-target>DAY)return null;
 return {record:plan.record,scheduledAt:plan.directive.scheduledAt,phase:confirmation?.directive.kind||(now>=target?'awaiting':'scheduled'),remainingMs:Math.max(0,target-now),confirmation:confirmation?.record||null};
}

export function isCurrentPlanNotice(record,records,now) {
 const current=annotateResetPlan(records.find(r=>r.id===record.id)||record);
 const directive=interpretResetDirective(current);
 if(directive?.kind==='cancelled')return false;
 if(directive?.kind!=='scheduled')return record.category!=='schedule'&&current.category!=='post'&&current.category!=='forecast';
 // Pre-feature generic snapshots cannot safely describe a newly recognized plan.
 if(!record.scheduledAt)return false;
 const state=getResetPlanState(records,now);
 return state?.phase==='scheduled'&&state.record.id===record.id&&state.scheduledAt===(record.scheduledAt||directive.scheduledAt);
}

export function resetNoticeKey(record){const d=interpretResetDirective(record);return 'reset:'+record.id+(d?.kind==='scheduled'?':plan:'+d.scheduledAt:'');}

export function formatPlanCountdown(milliseconds) {
 const seconds=Math.max(0,Math.ceil(milliseconds/1000));
 return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(v=>String(v).padStart(2,'0')).join(':');
}
