import test from 'node:test';
import assert from 'node:assert/strict';
import {conditionalForecast} from '../backend/model.mjs';
test('empirical probabilities use only completed global events known at cutoff',()=>{
 const start=Date.parse('2025-01-01T00:00:00Z');
 const records=Array.from({length:26},(_,i)=>({id:String(i),resetType:'automatic',resetAt:new Date(start+i*2*86400000).toISOString(),firstSeenAt:new Date(start+i*2*86400000).toISOString()}));
 const cutoff=start+50*86400000+12*3600000;
 const r=conditionalForecast([...records,{resetType:'banked',resetAt:new Date(cutoff-1000).toISOString(),firstSeenAt:new Date(cutoff-1000).toISOString()}],cutoff);
 assert.equal(r.samples,25); assert.equal(r.comparable,25);
 assert.deepEqual(r.diagnostics,[{hours:24,probability:0},{hours:48,probability:100},{hours:72,probability:100}]);
 assert.equal(r.published,false); assert.equal(r.reason,'review-required');
 assert.equal(conditionalForecast(records,start+1000).reason,'cooldown');
});
test('post publication is not a completed event, and future-known revisions are excluded',()=>{
 const r=conditionalForecast([{resetType:'automatic',postedAt:'2026-10-15T12:00:00Z',firstSeenAt:'2026-10-15T12:00:00Z'},{resetType:'automatic',resetAt:'2026-10-15T12:00:00Z',firstSeenAt:'2026-10-17T12:00:00Z'}],Date.parse('2026-10-16T12:00:00Z'));
 assert.equal(r.samples,0); assert.equal(r.published,false);
});
