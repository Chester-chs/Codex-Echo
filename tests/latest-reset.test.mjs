import test from 'node:test';
import assert from 'node:assert/strict';
import {latestResetInfo,resetTimeLabel} from '../src/lib/latest-reset.mjs';

const at=Date.parse('2026-10-17T13:00:00Z');
const plan={id:'2111492738025959922',url:'https://x.com/thsottiaux/status/2111492738025959922',postedAt:'2026-10-17T12:00:00Z',original:'We will reset in 5 hours.',type:'scheduled',category:'schedule',resetType:'automatic',textStatus:'verified'};
const observed={id:plan.id,url:plan.url,kind:'reset',state:'confirmed',sourceAt:plan.postedAt,observedAt:new Date(at).toISOString(),confirmationSource:'operator_observed'};
const done={...plan,id:'2111492738025959923',url:'https://x.com/thsottiaux/status/2111492738025959923',postedAt:'2026-10-17T14:00:00Z',original:'The reset is complete.',type:'automatic',category:'reset'};

test('recent resets use minutes and hours until the exact twelve-hour boundary',()=>{
 assert.equal(resetTimeLabel(at,at+30000,'zh','UTC').primary,'刚刚');
 assert.equal(resetTimeLabel(at,at+1800000,'zh','UTC').primary,'30 分钟前');
 assert.equal(resetTimeLabel(at,at+3600000,'zh','UTC').primary,'1 小时前');
 assert.equal(resetTimeLabel(at,at+43199999,'en','UTC').primary,'11 hours ago');
 assert.equal(resetTimeLabel(at,at+43200000,'zh','UTC').primary,'10月17日');
 assert.equal(resetTimeLabel(at,at+43200000,'en','UTC').relative,false);
 assert.equal(resetTimeLabel(at,at+3600000,'en','UTC').primary,'1 hour ago');
});

test('older reset dates follow the selected timezone and reject invalid or future times',()=>{
 const midnight=Date.parse('2026-10-17T23:30:00Z');
 assert.equal(resetTimeLabel(midnight,midnight+43200000,'zh','Asia/Shanghai').primary,'10月18日');
 assert.equal(resetTimeLabel(midnight,midnight+43200000,'zh','UTC').primary,'10月17日');
 assert.equal(resetTimeLabel(null,at,'en','UTC'),null);
 assert.equal(resetTimeLabel(at+1,at,'en','UTC'),null);
});

test('the latest reset uses observed time instead of a later confirmation of the same plan',()=>{
 const info=latestResetInfo([done],[plan,done],observed,at+7200000);
 assert.equal(info.at,at);assert.equal(info.basis,'observed');
 const next={...done,id:'2111492738025959924',url:'https://x.com/thsottiaux/status/2111492738025959924',postedAt:'2026-10-17T16:00:00Z',resetAt:'2026-10-17T15:30:00Z'};
 assert.equal(latestResetInfo([done,next],[plan,done,next],observed,at+14400000).at,Date.parse(next.resetAt));
});

test('announcements are explicitly labeled as a fallback and plans never become actual reset times',()=>{
 const announcement={...done,original:'Day 13/ Le limit reset'};
 const info=latestResetInfo([announcement],[plan,announcement],null,at+7200000);
 assert.equal(info.basis,'announcement');assert.equal(info.at,Date.parse(announcement.postedAt));
 assert.equal(latestResetInfo([plan],[plan],null,at+7200000),null);
 assert.equal(latestResetInfo([],[],null,at),null);
});

test('later confirmation does not replace a known actual reset timestamp',()=>{
 const actual={...done,postedAt:'2026-10-17T13:00:00Z',resetAt:'2026-10-17T12:30:00Z'};
 const later={...done,id:'2111492738025959925',url:'https://x.com/thsottiaux/status/2111492738025959925',original:'All propagated.'};
 const result=latestResetInfo([actual,later],[plan,actual,later],null,at+4200000);
 assert.equal(result.at,Date.parse(actual.resetAt));assert.equal(result.basis,'actual');
 const missing={...actual,original:'',textStatus:'missing',isReply:true,replyingTo:'thsottiaux',inReplyToId:plan.id,parent:plan};
 assert.equal(latestResetInfo([missing,later],[plan,missing,later],null,at+4200000).at,Date.parse(actual.resetAt));
});

test('a separate next-day completion is not merged into an old plan',()=>{
 const second={...done,id:'2111492738025959924',url:'https://x.com/thsottiaux/status/2111492738025959924',postedAt:'2026-10-18T13:00:00Z'};
 const result=latestResetInfo([done,second],[plan,done,second],null,Date.parse('2026-10-18T13:10:00Z'));
 assert.equal(result.at,Date.parse(second.postedAt));
});
