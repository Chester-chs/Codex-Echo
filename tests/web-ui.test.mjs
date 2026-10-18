import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as Vue from 'vue';
import * as domain from '../src/lib/domain.mjs';
import {createWebMonitor,canUsePageNotifications} from '../src/lib/web-alerts.mjs';
import {createClientTranslator} from '../src/lib/client-translations.mjs';
function loadWebUi(extra={}){
 const source=readFileSync(new URL('../src/pages/index/index.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1];
 const stack=[true],lines=[];
 for(const line of source.split('\n')){const c=line.match(/\/\/ #(ifdef|ifndef) (\S+)/);if(c){const yes=c[2]==='H5';stack.push(stack.at(-1)&&(c[1]==='ifdef'?yes:!yes));continue;}if(line.includes('// #endif')){stack.pop();continue;}if(stack.at(-1))lines.push(line);}
 const script=lines.join('\n').replace(/import\s+[\s\S]*?\s+from\s+["'][^"']+["'];?/g,'');
 const deps={...Vue,...domain,createWebMonitor,canUsePageNotifications,createClientTranslator,config:{},messages:{zh:{},en:{}},hasSession:()=>false,onLoad:()=>{},onShow:()=>{},onHide:()=>{},onMounted:()=>{},onUnmounted:()=>{},document:{documentElement:{}},uni:{getStorageSync:()=>({})}};
 Object.assign(deps,extra);const names=Object.keys(deps).filter(n=>/^[\w$]+$/.test(n)&&n!=='default');
 return new Function('deps',`const {${names.join(',')}}=deps;\n${script}\nreturn {refresh,openWebNotice,openDetail,focusedRecord,feed,forecastHistory,showForecastHistory,settings,toggleLanguage,cycleZone};`)(deps);
}

test('first visits use English and reopen with the last language and timezone choices',async()=>{
 const saved=new Map();
 const uni={getStorageSync:key=>saved.get(key),setStorageSync:(key,value)=>saved.set(key,structuredClone(value))};
 const first=loadWebUi({uni});
 assert.equal(first.settings.language,'en');assert.equal(first.settings.zone,'Europe/London');
 first.toggleLanguage();first.cycleZone();await Vue.nextTick();
 const reopened=loadWebUi({uni});
 assert.equal(reopened.settings.language,'zh');assert.equal(reopened.settings.zone,'Asia/Shanghai');
 reopened.toggleLanguage();reopened.cycleZone();await Vue.nextTick();
 const again=loadWebUi({uni});
 assert.equal(again.settings.language,'en');assert.equal(again.settings.zone,'UTC');
});
test('opening a prior forecast alert shows its saved snapshot even when the current forecast expired',()=>{
 const c=loadWebUi();
 const old={id:'old',probability:65,validUntil:'2026-10-10T00:00:00Z'};
 c.feed.value={records:[],forecast:null};c.openWebNotice({kind:'forecast',forecast:old,at:'2026-10-09T00:00:00Z'});
 assert.equal(c.showForecastHistory.value,true);assert.equal(c.forecastHistory.value[0].id,'old');assert.equal(c.forecastHistory.value[0].probability,65);
});
test('opening an uncached post outside the visible feed translates the modal record itself',async()=>{
 const c=loadWebUi({uni:{getStorageSync:()=>({language:'zh'})},createClientTranslator:options=>createClientTranslator({...options,translate:async()=> '这是一条新推文'})});
 const record={id:'outside',original:'New post outside the current feed'};await c.openDetail(record);
 assert.equal(c.focusedRecord.value.translation,'这是一条新推文');assert.equal(record.original,'New post outside the current feed');
});

test('a cold notification link opens a matching general post from the collected feed',async()=>{
 let load;const post={id:'2111244596131111253',type:'post',original:'Day 12/',textStatus:'mirror'};
 const c=loadWebUi({onLoad:fn=>{load=fn;},fetchFeed:async()=>({feed:{records:[],signals:[],posts:[post],sources:[]},mode:'live',checkedAt:new Date().toISOString()})});
 load({record:post.id});await c.refresh();assert.equal(c.focusedRecord.value?.id,post.id);
});

test('a notification target stays pending until source collection makes its record available',async()=>{
 let load,available=false;const post={id:'2111244596131111253',type:'automatic',original:'Completed'};
 const c=loadWebUi({onLoad:fn=>{load=fn;},fetchFeed:async()=>({feed:{records:available?[post]:[],signals:[],posts:available?[post]:[],sources:[]},mode:'live',checkedAt:new Date().toISOString()})});
 load({record:post.id});await c.refresh();assert.equal(c.focusedRecord.value,null);available=true;await c.refresh();assert.equal(c.focusedRecord.value?.id,post.id);
});
