import {normalizeResetConfirmation,resetEvidenceAt,interpretResetDirective,completionPlanId} from './reset-plan.mjs';

const validAt=(value,now)=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=now;

export function latestResetInfo(records=[],posts=records,confirmation=null,now=Date.now()){
 const history=records.filter(r=>!r.visibilityOnly&&['automatic','banked','unknown'].includes(r.type)&&r.category!=='schedule'&&validAt(r.postedAt,now));
 const candidates=[];
 const planKey=record=>{
  const explicit=record.isReply&&record.replyingTo==='thsottiaux'&&(record.inReplyToId||record.parent?.id);
  const direct=explicit&&posts.find(p=>[p.id,p.inReplyToId,p.parent?.id].includes(explicit)&&interpretResetDirective(p)?.kind==='scheduled'&&Date.parse(p.postedAt)<=Date.parse(record.postedAt));
  if(direct)return direct.id;
  const id=completionPlanId(record,posts,now),plan=posts.find(p=>p.id===id);
  if(!plan)return record.id;
  const target=Date.parse(interpretResetDirective(plan)?.scheduledAt);
  // A bare completion days later is not evidence of the same reset as an old plan.
  return Date.parse(record.postedAt)<=target+6*3600000?id:record.id;
 };
 for(const record of history){
  if(validAt(record.resetAt,now))candidates.push({key:planKey(record),at:Date.parse(record.resetAt),basis:'actual',priority:4,record});
  else if(interpretResetDirective(record)?.kind==='completed')candidates.push({key:planKey(record),at:Date.parse(record.postedAt),basis:'confirmed',priority:1,record});
 }
 const evidence=normalizeResetConfirmation(confirmation,now);
 if(evidence){
  const measured=validAt(evidence.observedAt,now);
  candidates.push({key:completionPlanId(evidence,posts,now)||evidence.id,at:measured?Date.parse(evidence.observedAt):resetEvidenceAt(evidence),basis:measured?'observed':'confirmed',priority:measured?3:1,record:null,sourceUrl:measured?'https://codex-reset.com':evidence.confirmationUrl});
 }
 const events=new Map();
 for(const candidate of candidates){
  const previous=events.get(candidate.key);
  if(!previous||candidate.priority>previous.priority||candidate.priority===previous.priority&&candidate.at<previous.at)events.set(candidate.key,candidate);
 }
 const latest=[...events.values()].sort((a,b)=>b.at-a.at)[0];
 if(latest)return latest;
 const record=history.sort((a,b)=>Date.parse(b.postedAt)-Date.parse(a.postedAt))[0];
 return record?{at:Date.parse(record.postedAt),basis:'announcement',record}:null;
}

export function resetTimeLabel(value,now=Date.now(),language='zh',zone='UTC'){
 const at=typeof value==='number'?value:typeof value==='string'?Date.parse(value):NaN;
 if(!Number.isFinite(at)||at>now)return null;
 const elapsed=now-at,relative=elapsed<12*3600000;
 if(relative){
  const minutes=Math.floor(elapsed/60000),hours=Math.floor(elapsed/3600000);
  const primary=minutes===0?(language==='zh'?'刚刚':'Just now'):hours===0?(language==='zh'?`${minutes} 分钟前`:`${minutes} ${minutes===1?'minute':'minutes'} ago`):(language==='zh'?`${hours} 小时前`:`${hours} ${hours===1?'hour':'hours'} ago`);
  return {relative,primary,year:null};
 }
 const locale=language==='zh'?'zh-CN':'en-GB';
 return {relative,primary:new Intl.DateTimeFormat(locale,{month:language==='zh'?'long':'short',day:'numeric',timeZone:zone}).format(new Date(at)),year:new Intl.DateTimeFormat('en',{year:'numeric',timeZone:zone}).format(new Date(at))};
}
