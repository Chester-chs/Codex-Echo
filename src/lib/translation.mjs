async function fetchText(url,{fetcher}) {const response=await fetcher(url,{signal:AbortSignal.timeout(15000),redirect:'manual'});if(!response.ok)throw new Error('Upstream HTTP '+response.status);const text=await response.text();if(text.length>3000000)throw new Error('Translation response too large');return text;}
// This public web translator requires no paid API or credential. A failed request
// leaves the Chinese view explicitly pending; it never replaces the original.
export async function translatePublicText(text,{fetcher=fetch}={}) {
 if(typeof text!=='string'||!text.trim())return '';
 if(text.length>12000)throw new Error('Translation text too long');
 const terms=[];
 const masked=text.replace(/https?:\/\/\S+|@[\w]+|\b(?:GPT-[\w.-]+|Codex|ChatGPT(?: Work)?|OpenAI|Tibo|Sol|Astra|Luna|AIPlanWatch|FxEmbed)\b/gi,term=>{terms.push(term);return `__${terms.length-1}__`;});
 const pieces=[];let cursor=0,translated='';
 while(cursor<masked.length){let end=Math.min(cursor+1800,masked.length);if(end<masked.length){const boundary=Math.max(masked.lastIndexOf(' ',end-1),masked.lastIndexOf('\n',end-1));if(boundary>cursor+900)end=boundary+1;}pieces.push(masked.slice(cursor,end));cursor=end;}
 if(pieces.length>7)throw new Error('Translation request budget exceeded');
 for(const piece of pieces){
  const endpoint=new URL('https://translate.googleapis.com/translate_a/single');
  for(const [k,v] of Object.entries({client:'gtx',sl:'auto',tl:'zh-CN',dt:'t',q:piece}))endpoint.searchParams.set(k,v);
  const payload=JSON.parse(await fetchText(endpoint.href,{fetcher}));
  if(!Array.isArray(payload?.[0])||!payload[0].length||payload[0].some(part=>typeof part?.[0]!=='string'))throw new Error('Invalid translation response');
  translated+=payload[0].map(part=>part[0]).join('');
 }
 for(let i=0;i<terms.length;i++){
  const token=`__${i}__`;
  if(!translated.includes(token))throw new Error('Translation changed protected term');
  translated=translated.replaceAll(token,terms[i]);
 }
 if(!translated.trim())throw new Error('Empty translation');
 return translated;
}
