export const BUILDERS_FEED='https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json';
export function parseBuilderFeed(payload,observedAt) {
 if(!Array.isArray(payload?.x))throw new Error('Invalid builder timeline');
 const author=payload.x.find(a=>a.handle==='thsottiaux');
 if(!author||!Array.isArray(author.tweets))throw new Error('Tibo timeline unavailable');
 const seen=new Set();
 return author.tweets.flatMap(post=>{
  if(!/^\d{15,22}$/.test(post.id)||seen.has(post.id)||post.url!==`https://x.com/thsottiaux/status/${post.id}`||typeof post.text!=='string'||!post.text.trim()||!Number.isFinite(Date.parse(post.createdAt))||Date.parse(post.createdAt)>Date.parse(observedAt))return [];
  seen.add(post.id);
  return [{id:post.id,url:post.url,postedAt:new Date(post.createdAt).toISOString(),detectedAt:observedAt,resetAt:null,resetType:'unknown',category:'post',original:post.text,author:'Tibo · @thsottiaux',textStatus:'community',textSource:BUILDERS_FEED,timeBasis:'api',translation:'',isQuote:post.isQuote===true}];
 });
}
