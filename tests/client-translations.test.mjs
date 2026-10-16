import test from 'node:test';
import assert from 'node:assert/strict';
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
