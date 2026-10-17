import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as provider from '../backend/codex-reset.mjs';
const fixture=name=>JSON.parse(readFileSync(new URL('./fixtures/codex-reset-'+name+'.json',import.meta.url)));
const now=Date.parse(fixture('feed').fetched_at);

test('optional radar context supplies ordinary posts without becoming reset evidence',()=>{
 const data=fixture('feed'),rows=provider.parseCodexResetFeed(data,now);
 for(const p of data.radar_context){const r=rows.find(r=>r.id===p.id);assert.ok(r);assert.equal(r.visibilityOnly,true);assert.equal(r.category,'post');assert.equal(r.original,p.text);assert.equal(r.resetAt,null);}
 for(const context of [undefined,{},[{id:'bad'}],[{...data.radar_context[0],url:'https://x.com/other/status/'+data.radar_context[0].id}]]){
  assert.equal(provider.parseCodexResetFeed({...data,radar_context:context},now).length,data.tweets.length);
 }
 const duplicate={...data.radar_context[0],...Object.fromEntries(['id','text','at','url'].map(k=>[k,data.tweets[0][k]]))};
 assert.equal(provider.parseCodexResetFeed({...data,radar_context:[duplicate]},now).filter(r=>r.id===duplicate.id).length,1);
});

test('public archive parses only canonical Tibo post text, times and replies as display-only',()=>{
 const html=readFileSync(new URL('./fixtures/codex-reset-archive.html',import.meta.url),'utf8');
 const rows=provider.parseCodexResetArchive(html,now);assert.equal(rows.length,3);assert.equal(rows[0].id,'2110951585983631505');assert.equal(rows[0].isReply,true);assert.equal(rows[0].original,'Can’t argue with that, Let’s break the cycle.');assert.ok(rows.every(r=>r.visibilityOnly&&r.category==='post'&&r.textSource==='https://codex-reset.com/tibo/x'));
 assert.throws(()=>provider.parseCodexResetArchive('<html>Markup changed</html>',now));
 assert.throws(()=>provider.parseCodexResetArchive(html.replaceAll('https://x.com/thsottiaux/','https://x.com/someone/'),now));
});

test('archive collection is bounded, uses the identifying reader and survives independent feed failure',async()=>{
 const {collectPublicSources}=await import('../backend/sources.mjs');const html=readFileSync(new URL('./fixtures/codex-reset-archive.html',import.meta.url),'utf8');let calls=0;
 const fetcher=async(url,options)=>{if(url==='https://codex-reset.com/tibo/x'){calls++;assert.match(options.headers['User-Agent'],/codex-echo-radar/);return new Response(html);}return new Response('unavailable',{status:503});};
 const args={fetcher,now:new Date(now).toISOString()};const first=await collectPublicSources(args);await collectPublicSources(args);assert.equal(calls,1);assert.equal(first.records.length,3);assert.ok(first.records.every(r=>r.visibilityOnly&&r.category==='post'));assert.equal(first.sources.find(s=>s.name==='codexreset-archive').status,'ok');
});

test('display-only posts survive merge, enrichment and normalization without reset or model changes',async()=>{
 const {mergeRecords}=await import('../backend/sources.mjs');const {publicFeed}=await import('../cloud/state.mjs');const {normalizeFeed}=await import('../src/lib/domain.mjs');const {getResetPlanState}=await import('../src/lib/reset-plan.mjs');
 const p=fixture('feed').radar_context[0],data={...fixture('feed'),tweets:[],radar_context:[{...p,text:'We will reset in 5 hours.'},{...p,id:'2111341888322314673',url:'https://x.com/thsottiaux/status/2111341888322314673',text:'The reset is complete.'}]};
 const rows=provider.parseCodexResetFeed(data,now),enriched=rows.map(r=>({...r,textStatus:'verified',textSource:'https://publish.x.com/oembed'}));
 for(const records of [mergeRecords(rows,enriched),mergeRecords(enriched,rows)]){
  const feed=publicFeed({records,sources:[]},now);assert.equal(feed.resets.length,0);assert.equal(feed.signals.length,0);assert.equal(feed.model.samples,0);assert.equal(getResetPlanState(normalizeFeed(feed,now).posts,now),null);assert.ok(feed.posts.every(r=>r.visibilityOnly&&r.category==='post'));
 }
 const real={...rows[1],visibilityOnly:false,category:'reset',resetType:'automatic',textSource:'https://codex-reset.com/api/feed'};
 for(const records of [mergeRecords([real],rows),mergeRecords(rows,[real])])assert.equal(records.find(r=>r.id===real.id).category,'reset');
});

test('display-only duplicates preserve confirmed reset timing and model samples in either merge order',async()=>{
 const {mergeRecords}=await import('../backend/sources.mjs');const {conditionalForecast}=await import('../backend/model.mjs');
 const real=provider.parseCodexResetTimeline(fixture('timeline')).find(r=>r.resetType==='automatic');real.resetAt=real.postedAt;real.firstSeenAt=real.postedAt;real.confirmed=true;
 const archive={...real,visibilityOnly:true,category:'post',resetType:'unknown',resetAt:null,confirmed:undefined,original:'Original post',textStatus:'mirror',textSource:'https://codex-reset.com/tibo/x'};
 for(const records of [mergeRecords([real],[archive]),mergeRecords([archive],[real])]){const merged=records[0];assert.equal(merged.resetAt,real.resetAt);assert.equal(merged.confirmed,true);assert.equal(merged.resetType,'automatic');assert.deepEqual(conditionalForecast(records,now),conditionalForecast([real],now));}
});
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
