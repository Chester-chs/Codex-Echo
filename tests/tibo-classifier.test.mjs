import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as api from '../src/lib/reset-plan.mjs';
import {formatBark} from '../web/bark.mjs';
import {formatTime,normalizeFeed} from '../src/lib/domain.mjs';
const cases=JSON.parse(readFileSync(new URL('./fixtures/tibo-post-cases.json',import.meta.url)));
const post=(original,postedAt='2026-10-17T12:00:00Z',extra={})=>({id:'2117536046041595904',url:'https://x.com/thsottiaux/status/2117536046041595904',original,postedAt,textStatus:'mirror',category:'post',...extra});
test('real October 23 self-reply preserves tomorrow, before and explicit PST through page and Bark',()=>{
 const parent=post('Day 18/ Decisions API is GA. But yes… that’s a reset!','2026-10-23T04:46:19Z');
 const row=post('Landing tomorrow before 10am PST together with a small ship.','2026-10-23T04:47:34Z',{id:'2113492502355562875',url:'https://x.com/thsottiaux/status/2113492502355562875',isReply:true,replyingTo:'thsottiaux',parent});
 const now=Date.parse('2026-10-23T09:00:00Z'),directive=api.interpretResetDirective(row);
 assert.equal(directive?.scheduledAt,'2026-10-23T18:00:00.000Z');
 assert.equal(directive?.before,true);
 const normalized=normalizeFeed({resets:[],posts:[row]},now).posts;
 const plan=api.getResetPlanState(normalized,now);
 assert.equal(plan.phase,'scheduled');assert.equal(plan.before,true);
 assert.equal(formatTime(plan.scheduledAt,'en','Europe/London'),'2026/10/23 19:00');
 assert.equal(formatTime(plan.scheduledAt,'zh','Asia/Shanghai'),'2026/10/24 02:00');
 for(const language of ['en','zh']){
  const alert=formatBark({kind:'alert',event:{...row,...directive,kind:'tweet',tweetClass:'plan'}},{language});
  assert.match(alert.body,/2026\/10\/23 19:00/);assert.match(alert.body,/2026\/10\/24 02:00/);
  assert.match(alert.body,language==='en'?/Before/:/截止时间之前/);
 }
});
test('Lands self-replies and day-qualified deadlines are recognized without accepting unrelated replies',()=>{
 const parent=post('Today is reset day.');
 for(const original of ['Lands tomorrow before 10am PST.','Landing tomorrow by 10am PST.']){
  const row=post(original,'2026-10-22T06:55:54Z',{isReply:true,replyingTo:'thsottiaux'});
  assert.equal(api.classifyTiboPost(row,{parent})?.scheduledAt,'2026-10-22T18:00:00.000Z');
  assert.equal(api.classifyTiboPost({...row,replyingTo:'someone_else'},{parent}),null);
  assert.equal(api.classifyTiboPost(row,{parent:post('A feature launch.')}),null);
 }
 assert.equal(api.classifyTiboPost(post('Global reset tomorrow before 10am PST.','2026-10-23T20:00:00Z'))?.scheduledAt,'2026-10-24T18:00:00.000Z');
 for(const [zone,target] of [['PST','2026-10-23T18:00:00.000Z'],['PDT','2026-10-23T17:00:00.000Z'],['PT','2026-10-23T17:00:00.000Z'],['UTC','2026-10-23T10:00:00.000Z']])assert.equal(api.classifyTiboPost(post(`Global reset today before 10am ${zone}.`,'2026-10-23T09:00:00Z'))?.scheduledAt,target);
});
for(const [i,sample] of cases.entries())test(`Tibo example ${i+1}: ${sample.text.slice(0,65)}`,()=>{
 assert.equal(typeof api.classifyTiboPost,'function');const {parent,...reply}=sample.reply||{};assert.deepEqual(api.classifyTiboPost(post(sample.text,sample.at,reply),{parent}),sample.expected);
});
test('time conversion uses Pacific daylight savings, explicit UTC and next-day rollover',()=>{
 for(const [text,at,target] of [
  ['Global reset landing by EOD PST time.','2026-12-15T01:00Z','2026-12-15T07:59:00.000Z'],
  ['Global reset will land at 6pm PST.','2026-12-15T01:00Z','2026-12-15T02:00:00.000Z'],
  ['Global reset will land at 6pm PDT.','2026-08-30T19:24Z','2026-08-31T01:00:00.000Z'],
  ['Global reset by 8pm.','2026-10-17T04:00Z','2026-10-18T03:00:00.000Z'],
  ['Global reset by EOD UTC.','2026-10-17T04:00Z','2026-10-17T23:59:00.000Z'],
  ['We will reset on 2026-10-17 at 18:00 UTC.','2026-10-17T12:00Z','2026-10-17T18:00:00.000Z'],
 ])assert.equal(api.classifyTiboPost(post(text,at))?.scheduledAt,target,text);
 assert.equal(api.classifyTiboPost(post('We will reset today at 8am PST.','2026-10-17T20:00Z'))?.kind,'commitment');
});
test('conditional sentences, unrelated resets, replies and display-only context never become push evidence',()=>{
 for(const original of ['We will reset the database in 2 hours.','We have not completed the reset.','We might reset in 2 hours.','We will discuss a reset in 2 hours.','The reset is complete in 5 hours.','Four updates or a reset. Or both.','We will reset in 2 hours?'])assert.equal(api.classifyTiboPost(post(original),{providerKind:'signal',explicitResetClaim:true}),null,original);
 assert.equal(api.classifyTiboPost(post('Reset will land at 6pm PST.',undefined,{isReply:true})),null);
 assert.equal(api.classifyTiboPost(post('The reset is complete.',undefined,{visibilityOnly:true})),null);
 assert.equal(api.classifyTiboPost(post('Day 9/ New features.'),{providerKind:'signal',explicitResetClaim:true}),null);
 assert.equal(api.classifyTiboPost(post('We are reseting usage for all paid users soon.')).kind,'commitment');
});
test('tweet notification templates distinguish plans, commitments and completions in both languages',()=>{
 for(const language of ['zh','en'])for(const tweetClass of ['plan','commitment','completed']){
  const event={...post('Global reset landing in 2 hours.'),kind:'tweet',state:tweetClass==='completed'?'confirmed':tweetClass,tweetClass,scope:'automatic',approximate:true,scheduledAt:'2026-10-17T14:00:00Z',translation:'全局重置将在两小时内推出。'};
  const result=formatBark({kind:'alert',event},{language});assert.match(result.body,/Data: codex-reset.com/);assert.match(result.url,/record=2117536046041595904/);assert.match(result.body,/London|伦敦/);assert.match(result.body,/Beijing|北京/);
  if(tweetClass==='plan')assert.match(result.body,language==='zh'?/最晚约/:/By about/);
  if(tweetClass==='commitment')assert.match(result.body,language==='zh'?/这是预告，不代表已完成/:/not a completed reset/i);
  if(tweetClass==='completed')assert.match(result.title,language==='zh'?/Tibo 确认重置完成/:/Tibo confirmed reset completion/);
 }
});
test('retained real feed parent relationships and original free mirror metadata follow the same classifier',()=>{
 const feed=JSON.parse(readFileSync(new URL('./fixtures/tibo-alert-posts.json',import.meta.url))),map=new Map(feed.tweets.map(p=>[p.id,p]));
 const child=map.get('2110595554036400151'),parent=map.get(child.in_reply_to_tweet_id);assert.equal(child.replying_to,'thsottiaux');assert.equal(api.classifyTiboPost(child,{parent})?.scheduledAt,new Date(Date.parse(child.at)+7200000).toISOString());
 const done=map.get('2108040921044639779');assert.equal(done.is_reply,false);assert.equal(api.classifyTiboPost(done).kind,'completed');
 for(const id of ['2110618732666257557','2086972802457063486']){const p=JSON.parse(readFileSync(new URL('./fixtures/tibo-post-'+id+'.json',import.meta.url))).tweet;assert.equal(p.replying_to,null);assert.equal(api.classifyTiboPost({original:p.text,postedAt:new Date(p.created_at).toISOString(),isReply:false}).kind,'completed');}
});
test('a cancellation self-reply inherits banked scope without borrowing a parent time',()=>{
 const parent={original:'Loading a banked reset.'},cancel=post('The reset is cancelled.',undefined,{isReply:true,replyingTo:'thsottiaux',parent});assert.deepEqual(api.interpretResetDirective(cancel),{kind:'cancelled',scope:'banked'});
 assert.equal(api.classifyTiboPost(post('Will be there soon.',undefined,{isReply:true,replyingTo:'thsottiaux'}),{parent:{original:'Banked reset will land at 6pm PST.'}}),null);
});
