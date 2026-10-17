import {fetchCodexReset} from '../backend/codex-reset.mjs';
export const providerAttemptKey=path=>path==='/api/forecast'?'codex-reset:attempt':'codex-reset:attempt:'+path;
export async function readProvider(env,path,{now=Date.now(),fetcher=fetch}={}){
 const db=env.NOTIFY_DB,key=providerAttemptKey(path);
 if(db){const claim=await db.prepare('INSERT INTO bark_meta(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value WHERE CAST(bark_meta.value AS INTEGER)<=? RETURNING value').bind(key,String(now),now-60000).first();if(!claim)throw Object.assign(new Error('Endpoint minute budget already used'),{code:'minute_budget'});}
 try{return await fetchCodexReset(path,{fetcher,now});}
 catch(error){if(error.retryAt&&db)await db.prepare('UPDATE bark_meta SET value=? WHERE name=?').bind(String(error.retryAt-60000),key).run();throw error;}
}
