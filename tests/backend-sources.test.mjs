import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHistory, parseTimeline, parseWatch, parseOEmbed, parseFxEmbed, mergeRecords, fetchText} from '../backend/sources.mjs';

const url='https://x.com/thsottiaux/status/2110618732666257557';

test('reviewed announcement types survive conflicting source labels without inventing completion',()=>{
 const row=(id,category='reset',resetType='automatic')=>({id,url:'https://x.com/thsottiaux/status/'+id,category,resetType,original:'Retained original',resetAt:null});
 const rows=mergeRecords([
  row('2076735790567338203'),row('2076418567143408112'),row('2090947107469558188','reset','unknown'),
  row('2097043464538264003','forecast','unknown'),row('2094144275957350900','forecast','unknown'),
  row('2071740419030053227'),row('2067399435009622521'),row('2105120226027450685','reset','banked'),
  row('2071381664853319742'),
 ]);
 const byId=Object.fromEntries(rows.map(r=>[r.id,r]));
 for(const id of ['2076735790567338203','2076418567143408112','2090947107469558188'])assert.equal(byId[id].resetType,'banked');
 for(const id of ['2097043464538264003','2094144275957350900'])assert.equal(byId[id].category,'reset');
 for(const id of ['2071740419030053227','2067399435009622521'])assert.deepEqual(byId[id].resetTypes,['automatic','banked']);
 assert.equal(byId['2105120226027450685'].category,'forecast');
 assert.ok(byId['2105120226027450685'].classificationNote);
 assert.equal(byId['2071381664853319742'].resetType,'automatic');
 assert.ok(rows.every(r=>r.resetAt===null&&r.original==='Retained original'));
 const merged=mergeRecords(rows,[row('2076735790567338203')]);
 assert.equal(merged.find(r=>r.id==='2076735790567338203').resetType,'banked');
});
test('source reader works without Node globals and preserves UTF-8 split across chunks',async()=>{
 const bytes=new TextEncoder().encode('Hello 雷达');
 const response={ok:true,headers:{get:()=>null},body:(async function*(){yield bytes.slice(0,7);yield bytes.slice(7);})()};
 const buffer=globalThis.Buffer;
 try{globalThis.Buffer=undefined;assert.equal(await fetchText(url,{fetcher:async()=>response}),'Hello 雷达');}finally{globalThis.Buffer=buffer;}
});
test('source reader rejects redirects with edge-compatible manual redirect handling',async()=>{
 await assert.rejects(fetchText(url,{fetcher:async(_url,options)=>{assert.equal(options.redirect,'manual');return {ok:false,status:302};}}),/Upstream HTTP 302/);
});
test('public history keeps all paragraphs and labels provenance without inventing completion',()=>{
 const rows=parseHistory(`<article class="event"><h3>Global reset</h3><blockquote>First line<br>Second &amp; final.</blockquote><a data-radar-source="reset" href="${url}">Source</a></article>`,'2026-10-16T12:00:00Z').records;
 assert.equal(rows[0].original,'First line\nSecond & final.');
 assert.equal(rows[0].resetAt,null); assert.equal(rows[0].timeBasis,'post-id');
 assert.equal(rows[0].resetType,'automatic');
 assert.throws(()=>parseHistory('<html>Temporarily unavailable</html>'));
});
test('timeline does not mislabel editorial interpretation as original text',()=>{
 const rows=parseTimeline(`<article class="post"><div class="post-main"><h3>Codex reset forecast source</h3><p>Inferred forecast: an editorial interpretation</p><a data-radar-source="tibo" data-radar-content="forecast" href="${url}">Source</a></div><time datetime="2026-10-16T04:00:00Z"></time></article>`).records;
 assert.equal(rows[0].original,''); assert.match(rows[0].context,/editorial/);
});
test('watch preserves provider time wording, probability, expiry and recorded time',()=>{
 const forecast={status:'ready',mode:'watch',probability:40,watch:{probability:40,windowText:'within 24h',sourceText:'A public hint',sourceUrl:url,observedAt:'2026-10-16T04:30:52Z',expiresAt:'2026-10-17T05:00:00Z'}};
 const flight='1:'+JSON.stringify(['$', 'component', null, {forecast}])+'\n';
 const html=`<section data-forecast-status="ready" data-forecast-mode="watch"></section><script>self.__next_f.push(${JSON.stringify([1,flight])})</script>`;
 const watch=parseWatch(html,'2026-10-16T12:00:00Z');
 assert.equal(watch.probability,40); assert.equal(watch.windowStart,null);
 assert.equal(watch.windowText,'within 24h'); assert.equal(watch.kind,'source-watch');
 assert.equal(parseWatch(html,'2026-10-18T12:00:00Z'),null);
 assert.throws(()=>parseWatch('<section data-forecast-status="ready" data-forecast-mode="watch"></section>'));
});
test('oEmbed detects clipped long posts and rejects unrelated author or post',()=>{
 const payload={author_url:'https://x.com/thsottiaux',url,html:'<blockquote><p>Hello<br>Clipped… <a href="https://t.co/example">https://t.co/example</a></p></blockquote>'};
 assert.equal(parseOEmbed(payload,url).textStatus,'truncated');
 assert.match(parseOEmbed(payload,url).original,/Hello\nClipped/);
 assert.throws(()=>parseOEmbed({...payload,author_url:'https://x.com/other'},url));
});
test('merge retains longest source text, strongest verification and reset classification',()=>{
 const records=mergeRecords([{id:'1',original:'complete text',textStatus:'verified',resetType:'automatic',category:'reset'}],[{id:'1',original:'clip',textStatus:'truncated',resetType:'unknown',category:'forecast'}]);
 assert.equal(records[0].original,'complete text'); assert.equal(records[0].resetType,'automatic');
});
test('reply mentions omitted by public embeds are retained from the archive',()=>{
 const [r]=mergeRecords([{id:'1',original:'A public hint',textStatus:'verified'}],[{id:'1',original:'@reader A public hint',textStatus:'source-copy'}]);
 assert.equal(r.original,'@reader A public hint');assert.equal(r.textStatus,'verified');
});
test('long-form mirror text validates author and ID and keeps raw text instead of a shortened display copy',()=>{
 const payload={code:200,tweet:{id:'2110618732666257557',author:{screen_name:'thsottiaux'},text:'Short display',raw_text:{text:'@reader Full text\nFinal paragraph.'}}};
 const result=parseFxEmbed(payload,url);assert.equal(result.original,'@reader Full text\nFinal paragraph.');assert.equal(result.textStatus,'mirror');
 assert.throws(()=>parseFxEmbed({...payload,tweet:{...payload.tweet,id:'1111111111111111111'}},url));
});
