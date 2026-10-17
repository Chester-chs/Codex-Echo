import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createClientTranslator} from '../src/lib/client-translations.mjs';
test('browser fallback translates missing Chinese once across feed clones while preserving originals',async()=>{
 let calls=0,saved;const service=createClientTranslator({translate:async text=>{calls++;return '中文：'+text;},save:cache=>{saved=cache;}});
 const original='New uncached Tibo update',a={original,translation:''},b={original,translation:''};
 const feed={records:[a],posts:[b],signals:[],forecast:{basis:original}};
 await service.apply(feed,'zh');assert.equal(calls,1);assert.equal(a.translation,'中文：'+original);assert.equal(b.translation,a.translation);assert.equal(feed.forecast.basisZh,a.translation);assert.equal(a.original,original);
 const c={original},archived={basis:original};await service.apply({posts:[c],forecasts:[archived]},'zh');assert.equal(calls,1);assert.equal(c.translation,a.translation);assert.equal(saved[original],a.translation);assert.equal(archived.basisZh,a.translation);
});
test('browser fallback remains quiet in English, bounds work and backs off after provider failure',async()=>{
 let calls=0;const service=createClientTranslator({translate:async()=>{calls++;throw new Error('429');},now:()=>1000});
 const feed={posts:Array.from({length:5},(_,i)=>({original:'Unseen post '+i}))};
 await service.apply(feed,'en');assert.equal(calls,0);
 await service.apply(feed,'zh');assert.equal(calls,3);
 await service.apply({posts:feed.posts.slice(0,3)},'zh');assert.equal(calls,3);assert.ok(feed.posts.every(r=>!r.translation));
});
test('mirror provenance distinguishes Codex Reset, FxEmbed and missing text in both languages',async()=>{const content=await import('../src/lib/localized-content.mjs');const {messages}=await import('data:text/javascript,'+encodeURIComponent(readFileSync(new URL('../src/lib/i18n.js',import.meta.url),'utf8')));assert.equal(typeof content.sourceTextKey,'function');const key=content.sourceTextKey({textStatus:'mirror',textSource:'https://codex-reset.com/api/feed'});assert.equal(key,'text_codexreset');for(const lang of ['zh','en']){assert.match(messages[lang][key],/codex-reset\.com/);assert.ok(!messages[lang][key].includes('FxEmbed'));}assert.equal(content.sourceTextKey({textStatus:'mirror',textSource:'https://api.fxtwitter.com'}),'text_mirror');assert.equal(content.sourceTextKey({textStatus:'missing',textSource:'https://codex-reset.com/api/timeline'}),'text_missing');});

test('language-neutral posts do not consume the browser translation budget',async()=>{
 const calls=[],service=createClientTranslator({translate:async text=>{calls.push(text);return '翻译：'+text;}}),posts=['@ajambrosino 2+2?','@Tibo 🚀','Codex GPT-6 100%','A new announcement'].map(original=>({original}));
 await service.apply({posts},'zh');assert.deepEqual(calls,['A new announcement']);assert.equal(posts[0].translation,'@ajambrosino 2+2?');assert.equal(posts[3].translation,'翻译：A new announcement');
});
