import {mkdirSync,readFileSync,writeFileSync,copyFileSync,cpSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve('dist/weixin-project');
mkdirSync(root,{recursive:true});
cpSync('dist/build/mp-weixin',root+'/miniprogram',{recursive:true});
for(const [name,entry] of [['pulseApi','api-entry.cjs'],['pulseSync','sync-entry.cjs']]){
 const folder=root+'/cloudfunctions/'+name;
 for(const sub of ['cloud','backend','src/lib'])mkdirSync(folder+'/'+sub,{recursive:true});
 for(const file of ['state.mjs','database.mjs','api.mjs','gateway.mjs','sync.mjs'])copyFileSync('cloud/'+file,folder+'/cloud/'+file);
 for(const file of ['sources.mjs','tweets.mjs','model.mjs','wechat.mjs'])copyFileSync('backend/'+file,folder+'/backend/'+file);
 copyFileSync('src/lib/domain.mjs',folder+'/src/lib/domain.mjs');
 copyFileSync('cloud/'+entry,folder+'/index.js');
 for(const file of ['package.json','package-lock.json'])copyFileSync('cloud/'+file,folder+'/'+file);
 writeFileSync(folder+'/config.json',JSON.stringify(name==='pulseSync'?{permissions:{openapi:['subscribeMessage.send']}}:{},null,2));
}
const appid=JSON.parse(readFileSync('src/manifest.json','utf8'))['mp-weixin'].appid||'touristappid';
writeFileSync(root+'/project.config.json',JSON.stringify({appid,projectname:'PulseRadar',compileType:'miniprogram',miniprogramRoot:'miniprogram/',cloudfunctionRoot:'cloudfunctions/',setting:{es6:true,minified:true,urlCheck:true}},null,2));
console.log('WeChat project prepared: '+root);
