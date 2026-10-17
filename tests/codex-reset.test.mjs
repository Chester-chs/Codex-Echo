import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as provider from '../backend/codex-reset.mjs';
const fixture=name=>JSON.parse(readFileSync(new URL('./fixtures/codex-reset-'+name+'.json',import.meta.url)));
const now=Date.parse(fixture('feed').fetched_at);
test('fresh X API feed decodes entities, preserves replies and includes Day 12',()=>{
 const rows=provider.parseCodexResetFeed(fixture('feed'),now);const day=rows.find(r=>r.id==='2111244596131111253');
 assert.match(day.original,/Codex & Work/);assert.ok(!day.original.includes('&amp;'));assert.equal(day.textStatus,'mirror');assert.equal(day.category,'post');assert.equal(day.timeBasis,'api');assert.ok(rows.some(r=>r.isReply));
});
test('feed rejects stale data, changed identity, missing fields and future fetch times',()=>{
 for(const change of [{stale:true},{source:'scraper'},{fetched_at:null},{fetched_at:new Date(now-1800001).toISOString()},{fetched_at:new Date(now+120000).toISOString()},{tweets:[{id:'bad'}]}])assert.throws(()=>provider.parseCodexResetFeed({...fixture('feed'),...change},now));
});
test('timeline uses only confirmed global reset events and never calls summaries original tweets',()=>{
 const rows=provider.parseCodexResetTimeline(fixture('timeline'));assert.ok(rows.length>30);assert.ok(rows.every(r=>r.category==='reset'&&r.original===''&&r.textStatus==='missing'));
 const p={events:[{...fixture('timeline').events[0],announced_at:'2026-10-15T06:13:01Z',effective_at:'2026-10-15T06:14:00Z'}]};const r=provider.parseCodexResetTimeline(p)[0];assert.equal(r.resetAt,'2026-10-15T06:14:00.000Z');assert.equal(r.postedAt,'2026-10-15T06:13:01.000Z');
 assert.equal(provider.parseCodexResetTimeline({events:[{type:'reset',confirmed:false,scope:'global'}]}).length,0);assert.throws(()=>provider.parseCodexResetTimeline({}));
});
test('latest alert accepts only observed schemas and logs unknown raw kind/state without guessing',()=>{
 const p=fixture('forecast'),a=provider.parseLatestAlert(p);assert.equal(a.state,'confirmed');assert.equal(a.confirmationSource,'operator_observed');assert.equal(a.id,p.latest_alert.id);
 const logs=[];assert.equal(provider.parseLatestAlert({latest_alert:{kind:'watch',state:'urgent'}},{log:x=>logs.push(x)}),null);assert.deepEqual(logs[0],{event:'codex_reset_alert_ignored',kind:'watch',state:'urgent'});
 assert.equal(provider.parseLatestAlert({latest_alert:null}),null);assert.throws(()=>provider.parseLatestAlert({}));assert.throws(()=>provider.parseLatestAlert({latest_alert:{...p.latest_alert,source_at:'broken'}}));
});
test('provider fetch is bounded, identifies itself, and concurrent requests share a one-minute cache',async()=>{
 let calls=0;const fetcher=async(url,opts)=>{calls++;assert.match(opts.headers['User-Agent'],/codex-echo-radar\/1.0/);return Response.json({ok:true});};
 const args={fetcher,now};await Promise.all([provider.fetchCodexReset('/api/forecast',args),provider.fetchCodexReset('/api/forecast',args)]);await provider.fetchCodexReset('/api/forecast',{...args,now:now+59000});assert.equal(calls,1);await provider.fetchCodexReset('/api/forecast',{...args,now:now+60000});assert.equal(calls,2);
 await assert.rejects(provider.fetchCodexReset('/api/feed',{fetcher:async()=>new Response('x',{headers:{'Content-Length':'4000000'}}),now}));
});
test('collection fetches feed and timeline once each and retains new verified-mirror posts with legacy failures',async()=>{const {collectPublicSources}=await import('../backend/sources.mjs');const calls=[];const result=await collectPublicSources({now:new Date(now).toISOString(),fetcher:async url=>{calls.push(url);if(url==='https://codex-reset.com/api/feed')return Response.json(fixture('feed'));if(url==='https://codex-reset.com/api/timeline')return Response.json(fixture('timeline'));return new Response('unavailable',{status:503});}});assert.equal(calls.filter(x=>x.endsWith('/api/feed')).length,1);assert.equal(calls.filter(x=>x.endsWith('/api/timeline')).length,1);assert.ok(!calls.some(x=>x==='https://codex-reset.com/api/forecast'));assert.ok(result.records.some(r=>r.id==='2111244596131111253'));assert.ok(result.sources.some(s=>s.name==='codexreset-feed'&&s.status==='ok'));});
test('provider honours Retry-After and rejects numeric post IDs',async()=>{const bad=fixture('feed');bad.tweets[0].id=Number(bad.tweets[0].id);assert.throws(()=>provider.parseCodexResetFeed(bad,now));let calls=0;const fetcher=async()=>{calls++;return new Response('busy',{status:429,headers:{'Retry-After':'300'}});};await assert.rejects(provider.fetchCodexReset('/api/feed',{fetcher,now}));await assert.rejects(provider.fetchCodexReset('/api/feed',{fetcher,now:now+120000}));assert.equal(calls,1);});
test('public status reports the configured collection interval without implying a private cron changed',async()=>{const {handleRequest}=await import('../web/worker.mjs');const request=new Request('https://radar.test/api/status');const current=await (await handleRequest(request,{})).json();assert.equal(current.pollSeconds,600);const recommended=await (await handleRequest(request,{PUBLIC_POLL_SECONDS:'300'})).json();assert.equal(recommended.pollSeconds,300);});
