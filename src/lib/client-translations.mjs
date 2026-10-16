import {translatePublicText} from './translation.mjs';
import {archivedTranslations} from './translations-zh.mjs';

export function createClientTranslator({translate=translatePublicText,load=()=>({}),save=()=>{},now=Date.now}={}) {
 let cache={};try{const stored=load();if(stored&&typeof stored==='object')cache=Object.fromEntries(Object.entries(stored).filter(([text,zh])=>text.length<=12000&&typeof zh==='string'&&/[\u3400-\u9fff]/.test(zh)).slice(-200));}catch{}
 const inflight=new Map(),retryAt=new Map();
 return {async apply(feed,language='zh'){
  if(language!=='zh')return;
  const groups=new Map();
  function add(text,target,key){if(!text)return;const group=groups.get(text)||[];group.push({target,key});groups.set(text,group);}
  if(feed.forecast)add(feed.forecast.basis,feed.forecast,'basisZh');
  for(const forecast of feed.forecasts||[])add(forecast.basis,forecast,'basisZh');
  for(const row of [...(feed.posts||[]),...(feed.records||[]),...(feed.signals||[])])add(row.original,row,'translation');
  const missing=[];
  for(const [text,bindings] of groups){const known=archivedTranslations[text]||cache[text]||bindings.map(b=>b.target[b.key]).find(zh=>typeof zh==='string'&&/[\u3400-\u9fff]/.test(zh));if(known){for(const b of bindings)b.target[b.key]=known;}else if((retryAt.get(text)||0)<=now())missing.push([text,bindings]);}
  await Promise.all(missing.slice(0,3).map(async([text,bindings])=>{
   let pending=inflight.get(text);
   if(!pending){pending=translate(text).then(zh=>{if(typeof zh!=='string'||!/[\u3400-\u9fff]/.test(zh))throw new Error('Chinese translation unavailable');cache[text]=zh;cache=Object.fromEntries(Object.entries(cache).slice(-200));try{save(cache);}catch{}return zh;}).catch(()=>{retryAt.set(text,now()+5*60000);return '';}).finally(()=>inflight.delete(text));inflight.set(text,pending);}
   const translated=await pending;if(translated)for(const b of bindings)b.target[b.key]=translated;
  }));
 }};
}
