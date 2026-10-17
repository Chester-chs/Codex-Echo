import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBuilderFeed} from '../backend/tweets.mjs';
import {mergeRecords,enrichOriginal} from '../backend/sources.mjs';
import {normalizeFeed} from '../src/lib/domain.mjs';
import {displayText,localizedWindow} from '../src/lib/localized-content.mjs';
import {translatePublicText} from '../backend/translate.mjs';
const id='2110971985417441512',url=`https://x.com/thsottiaux/status/${id}`,now='2026-10-16T12:00:00Z';
const post={id,url,text:'A new project',createdAt:'2026-10-16T05:51:55Z'};
test('general timeline accepts only matching Tibo posts and does not turn ordinary posts into resets',()=>{
 const p={generatedAt:now,x:[{handle:'other',tweets:[post]},{handle:'thsottiaux',tweets:[post,{...post,id:'bad'},{...post,url:url.replace('thsottiaux','other')},{...post,createdAt:'2027-01-01T00:00:00Z'}]}]};
 const result=parseBuilderFeed(p,now);assert.equal(result.length,1);assert.equal(result[0].category,'post');assert.equal(result[0].resetType,'unknown');
});
test('a general-post source cannot downgrade classified announcements or erase a matching translation',()=>{
 const old={id,category:'reset',resetType:'automatic',original:'Complete post',translation:'完整推文',textStatus:'verified'};
 const newer={...old,category:'post',resetType:'unknown',translation:'',textStatus:'source-copy'};
 const [r]=mergeRecords([old],[newer]);assert.equal(r.category,'reset');assert.equal(r.translation,'完整推文');
 const [changed]=mergeRecords([old],[{...newer,original:'Changed complete post',textStatus:'verified'}]);assert.equal(changed.translation,'');
});
test('normalized all-post timeline deduplicates and preserves general posts separately from reset statistics',()=>{
 const base={id,url,postedAt:now,original:'Hi',resetType:'automatic'};
 const data=normalizeFeed({resets:[base],signals:[],posts:[{...base,category:'reset'},{...base,id:'2110864861119045840',url:'https://x.com/thsottiaux/status/2110864861119045840',category:'post'},base]});
 assert.equal(data.records.length,1);assert.equal(data.posts.length,2);assert.equal(data.posts[1].type,'post');
 assert.equal(normalizeFeed({resets:[base]}).posts.length,1);
});
test('Chinese content never silently falls back to an untranslated English post',()=>{
 assert.equal(displayText({original:'Hello',translation:'你好'},'zh'),'你好');
 assert.match(displayText({original:'Unknown new text'},'zh'),/中文/);
 assert.equal(displayText({original:'Hello',translation:'你好'},'en'),'Hello');
 assert.match(displayText({original:'Hello',translation:'Hello'},'zh'),/中文/);
 assert.equal(localizedWindow('within 48h','zh'),'未来 48 小时内');
 assert.equal(localizedWindow('sometime soon','zh'),'具体时间请查看预测依据');
});
test('Chinese display preserves mention-only, mathematical and emoji posts without a pending placeholder',()=>{
 for(const original of ['@ajambrosino 2+2?','@Tibo 🚀','https://x.com/thsottiaux/status/123','Codex GPT-6 100%','123 + 456 = 579'])assert.equal(displayText({original},'zh'),original);
});

test('missing translations show the original with an explicit Chinese label instead of hiding content',()=>{
 const original='A newly published update';const result=displayText({original},'zh');assert.ok(result.includes(original));assert.match(result,/暂无中文译文/);assert.ok(!result.includes('正在准备'));
 assert.equal(displayText({original,translation:'中文译文正在准备中，可展开查看原文。'},'zh'),result);
 assert.equal(displayText({original:''},'zh'),'暂无可显示的推文原文。');
});

test('public translation preserves handles and product names and rejects malformed responses',async()=>{
 const fetcher=async request=>{const q=new URL(request).searchParams.get('q');return new Response(JSON.stringify([[[q.replace('Hello','你好'),q]]]),{headers:{'Content-Type':'application/json'}});};
 const result=await translatePublicText('Hello @thsottiaux Codex',{fetcher});
 assert.equal(result,'你好 @thsottiaux Codex');
 await assert.rejects(translatePublicText('Hello',{fetcher:async()=>new Response('{}')}),/translation/i);
});
test('protected names survive a translator that localizes English placeholder words',async()=>{
 const fetcher=async request=>new Response(JSON.stringify([[[new URL(request).searchParams.get('q').replace('Hello','你好').replaceAll('PULSE','脉冲')]]]));
 assert.equal(await translatePublicText('Hello Codex',{fetcher}),'你好 Codex');
});
test('a newly completed original invalidates the translation of its older shortened text',async()=>{
 const old={id,url,original:'Short text',translation:'短文本',textStatus:'source-copy'};
 const fetcher=async()=>new Response(JSON.stringify({author_url:'https://x.com/thsottiaux',url,html:'<blockquote><p>Short text with a new final paragraph.</p></blockquote>'}));
 const enriched=await enrichOriginal(old,{fetcher,mirror:false});
 assert.equal(enriched.original,'Short text with a new final paragraph.');assert.equal(enriched.translation,'');
});
test('name masking cannot expand one translation beyond its seven-request budget',async()=>{
 let calls=0;const fetcher=async request=>{calls++;return new Response(JSON.stringify([[[new URL(request).searchParams.get('q')]]]));};
 await assert.rejects(translatePublicText('Sol '.repeat(1800),{fetcher}),/budget/i);assert.equal(calls,0);
});
test('long translation chunks keep words intact instead of translating broken fragments',async()=>{
 const chunks=[],text='hello '.repeat(299)+'one these words';
 const fetcher=async request=>{const q=new URL(request).searchParams.get('q');chunks.push(q);return new Response(JSON.stringify([[[q]]]));};
 assert.equal(await translatePublicText(text,{fetcher}),text);assert.ok(chunks[0].endsWith('one '));
});
