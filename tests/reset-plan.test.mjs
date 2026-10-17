import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFeed} from '../src/lib/domain.mjs';
import {resetOverview,monthGrid} from '../src/lib/calendar.mjs';
import {mergeRecords} from '../backend/sources.mjs';
import {formatBark} from '../web/bark.mjs';

let api;try{api=await import('../src/lib/reset-plan.mjs');}catch{}
test('announced reset plans have a shared interpreter',()=>assert.ok(api?.interpretResetDirective,'Reset plan interpreter is missing'));
const opts={skip:!api},now=Date.parse('2026-10-17T12:00:00Z');
const post=(text,offset=0,id='2117536046041595904')=>({id,url:'https://x.com/thsottiaux/status/'+id,postedAt:new Date(now+offset).toISOString(),original:text,textStatus:'verified',author:'Tibo · @thsottiaux',category:'reset',resetType:'automatic'});

test('five-hour plans are anchored to publication time, independent of collection time',opts,()=>{
 const r=post('We will reset Codex limits in 5 hours.');
 assert.equal(api.interpretResetDirective(r).scheduledAt,'2026-10-17T17:00:00.000Z');
 assert.equal(api.getResetPlanState([r],now+3600000).remainingMs,14400000);
 assert.equal(api.formatPlanCountdown(18000000),'05:00:00');
 assert.equal(api.interpretResetDirective(post('Codex 将在 5 小时后重置。')).scheduledAt,'2026-10-17T17:00:00.000Z');
});

test('explicit UTC dates are accepted but vague, conditional, translated and unrelated statements are not plans',opts,()=>{
 assert.equal(api.interpretResetDirective(post('Codex will reset on 2026-10-17 at 18:00 UTC.')).scheduledAt,'2026-10-17T18:00:00.000Z');
 for(const text of ['We might reset in 5 hours.','Will we reset in 5 hours?','If we reset in 5 hours, would that help?','We will reset at 8 tonight.','I hope we will reset in 5 hours.','We will not reset in 5 hours.','No reset will happen in 5 hours.','We will discuss a reset in 5 hours.','The reset is complete in 5 hours.','We will reset our database in 5 hours.','We will reset on 2026-02-30 at 18:00 UTC.','We will reset in 5 hours or in 8 hours.'])assert.equal(api.interpretResetDirective(post(text)),null,text);
 assert.equal(api.interpretResetDirective(post('We will reset in 5 hours and 30 minutes.')).scheduledAt,'2026-10-17T17:30:00.000Z');
 assert.equal(api.interpretResetDirective({...post('We will reset in 5 hours.'),textStatus:'community'}),null);
 assert.equal(api.interpretResetDirective({...post('Maybe later.'),translation:'我们将在5小时后重置'}),null);
 assert.equal(api.interpretResetDirective({...post('We will reset in 5 hours.'),url:'https://x.com/someone/status/2117536046041595904'}),null);
 for(const text of ["We'll let you know when the reset is complete.",'Once the reset is complete, we will publish an update.'])assert.equal(api.interpretResetDirective(post(text)),null,text);
});

test('passing the target time waits for confirmation and a later explicit completion or cancellation resolves it',opts,()=>{
 const r=post('We will reset in 5 hours.');
 assert.equal(api.getResetPlanState([r],now+18000001).phase,'awaiting');
 assert.equal(api.getResetPlanState([r],now+18000001).remainingMs,0);
 const done=post('The reset is complete.',18000001,'2117536046041595905');
 assert.equal(api.getResetPlanState([r,done],now+19000000).phase,'completed');
 const cancel=post('The reset is cancelled.',60000,'2117536046041595906');
 assert.equal(api.getResetPlanState([r,cancel],now+120000).phase,'cancelled');
 assert.equal(api.getResetPlanState([r,post('Maybe the reset is complete.',60000)],now+120000).phase,'scheduled');
 assert.equal(api.isCurrentPlanNotice({...r,textStatus:undefined},[{...r,original:'The reset is cancelled.'}],now+120000),false);
 assert.equal(api.getResetPlanState([r],now+8*86400000),null,'Old plans cannot remain active forever');
 for(const text of ['We have cancelled the reset.','We have canceled the reset.','We have postponed the reset.','The reset has been delayed.','The Codex reset is cancelled.'])assert.equal(api.getResetPlanState([r,post(text,60000,'2117536046041595907')],now+120000).phase,'cancelled',text);
});

test('banked completion scope survives feed normalization',opts,()=>{
 assert.equal(api.interpretResetDirective(post('The banked reset is cancelled.')).kind,'cancelled');
 assert.equal(api.interpretResetDirective(post('The banked reset is complete.')).scope,'banked');
 const records=[{...post('The banked reset will happen in 5 hours.'),resetType:'banked'},{...post('The reset is complete.',60000,'2117536046041595908'),resetType:'banked'}];
 const normalized=normalizeFeed({resets:records,posts:records},now+120000);
 assert.equal(api.getResetPlanState(normalized.posts,now+120000).phase,'completed');
});

test('uncertainty, separate clauses and partial duration matches cannot manufacture a definite state',opts,()=>{
 const plan=post('We will reset in 5 hours.');
 for(const text of ['We will reset in 5 hours. Timing is tentative.','We will reset in 5 hours. Assuming the rollout succeeds.','We are checking whether the reset is complete.','We need to verify the reset is complete.','We will reset in 5 hours or so.','We will reset in 5 hours at the earliest.','We will reset in 5 hours or later.','We will reset in 5 hours assuming everything goes smoothly.','We will reset in 5 hours to 6 hours.','We will reset. We will share the details in 5 hours.']){
  assert.equal(api.interpretResetDirective(post(text)),null,text);
  assert.equal(api.getResetPlanState([plan,post(text,60000,'2117536046041595909')],now+120000).phase,'scheduled',text);
 }
 assert.equal(api.interpretResetDirective(post('We will reset in 1 hour, 30 minutes.')).scheduledAt,'2026-10-17T13:30:00.000Z');
 assert.equal(api.interpretResetDirective(post('Codex 将在 5 小时 30 分钟后重置。')).scheduledAt,'2026-10-17T17:30:00.000Z');
});

test('a newer precise plan supersedes the previous plan without inheriting a previous completion',opts,()=>{
 const old=post('We will reset in 5 hours.');
 const done=post('The reset is complete.',60000,'2117536046041595905');
 const next=post('We will reset in 8 hours.',120000,'2117536046041595906');
 const state=api.getResetPlanState([next,old,done],now+180000);
 assert.equal(state.record.id,next.id);assert.equal(state.phase,'scheduled');
});

test('scheduled posts retain their text and time but do not inflate historical reset statistics',opts,()=>{
 const records=mergeRecords([post('We will reset in 5 hours.')]);
 assert.equal(records[0].category,'schedule');assert.equal(records[0].resetAt,null);
 const f=normalizeFeed({resets:records,posts:records},now+1000);
 assert.equal(f.posts[0].type,'scheduled');assert.equal(f.records[0].scheduledAt,'2026-10-17T17:00:00.000Z');
 assert.equal(resetOverview(f.records,'UTC',now+1000).total,0);
});

test('calendar plan markers use the target date in the selected zone and do not add historical posts',opts,()=>{
 const r=post('We will reset on 2026-10-17 at 23:00 UTC.');
 const plan=api.getResetPlanState([r],now),overview=resetOverview([],'Asia/Shanghai',now);
 const grid=monthGrid('2026-10',overview,'2026-10-17',plan,'Asia/Shanghai');
 assert.equal(grid.cells.find(c=>c?.key==='2026-10-18').planned,true);
 assert.equal(grid.cells.find(c=>c?.key==='2026-10-17').planned,false);
 assert.equal(grid.total,0);
});

test('Bark distinguishes a planned reset from completed activity in both languages',opts,()=>{
 const event=mergeRecords([post('We will reset in 5 hours.')])[0];
 for(const language of ['zh','en']){
  const payload=formatBark({kind:'reset',event},{language});
  assert.match(payload.title,language==='zh'?/计划/:/planned/i);
  assert.ok(payload.body.includes('18:00'));assert.ok(payload.body.includes('2026/10/18 01:00'));assert.doesNotMatch(payload.body,/实际重置时间\n|Actual reset time\n/);
 }
});

const observation=(plan,at)=>({id:plan.id,kind:'reset',state:'confirmed',sourceAt:new Date(at).toISOString(),url:plan.url,confirmationSource:'operator_observed',observedAt:new Date(at).toISOString(),summary:'Observed by provider'});

test('completion uses evidence time and can reference the explicit self-reply parent',()=>{
 const parent=post('Day 13/ Le limit reset'),child={...post('Landing sometime today by EOD PST',1000,'2111492738025959922'),isReply:true,replyingTo:'thsottiaux',inReplyToId:parent.id,parent};
 for(const r of [parent,child]){
  const evidence={...observation(r,now+3600000),sourceAt:parent.postedAt};
  assert.equal(api.getResetPlanState([parent,child],now+3600000,evidence).phase,'observed');
 }
});
test('provider observation stops a matching plan countdown without claiming Tibo confirmed',()=>{
 const r=post('We will reset in 5 hours.'),event=observation(r,now+3600000),f=normalizeFeed({resets:[r],posts:[r],resetConfirmation:event},now+3600000);
 const p=api.getResetPlanState(f.posts,now+3600000,f.resetConfirmation);assert.equal(p.phase,'observed');assert.equal(p.remainingMs,0);assert.equal(p.observation.observedAt,'2026-10-17T13:00:00.000Z');assert.equal(p.confirmation,null);assert.equal(f.records.length,1);
 assert.equal(api.isCurrentPlanNotice({...r,scheduledAt:'2026-10-17T17:00:00.000Z'},f.posts,now+3600000,f.resetConfirmation),false);
});
test('observations cannot resolve unrelated, future, older or cancelled plans',()=>{
 const r=post('We will reset in 5 hours.'),event=observation(r,now+3600000);
 for(const extra of [{id:'2117536046041595999'},{sourceAt:new Date(now+7200000).toISOString(),observedAt:new Date(now+7200000).toISOString()},{sourceAt:new Date(now-1000).toISOString(),observedAt:new Date(now-1000).toISOString()},{confirmationSource:'untrusted'},{observedAt:null}])assert.equal(api.getResetPlanState([r],now+3600000,{...event,...extra}).phase,'scheduled');
 const cancel=post('The reset is cancelled.',60000,'2117536046041595906');assert.equal(api.getResetPlanState([r,cancel],now+3600000,event).phase,'cancelled');
 const next=post('We will reset in 8 hours.',120000,'2117536046041595907');assert.equal(api.getResetPlanState([r,next],now+3600000,event).phase,'scheduled');
});
test('a later Tibo confirmation upgrades provider observation to completed',()=>{
 const r=post('We will reset in 5 hours.'),event=observation(r,now+3600000),done=post('The reset is complete.',3600001,'2117536046041595905');assert.equal(api.getResetPlanState([r,done],now+3700000,event).phase,'completed');
 const official={...event,confirmationSource:'tibo_confirmed',confirmedAt:new Date(now+3600000).toISOString(),confirmationUrl:done.url};assert.equal(api.getResetPlanState([r],now+3700000,official).phase,'completed');
});

test('malformed optional confirmation never hides an otherwise valid feed',()=>{
 const r=post('We will reset in 5 hours.');for(const bad of [{...observation(r,now+1000),url:42},{...observation(r,now+1000),confirmationSource:'unknown'},[],null]){const f=normalizeFeed({resets:[r],resetConfirmation:bad},now+1000);assert.equal(f.records.length,1);assert.equal(f.resetConfirmation,null);}
});
