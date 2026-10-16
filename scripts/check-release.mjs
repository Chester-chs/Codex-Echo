import {readFileSync,existsSync} from 'node:fs';
const manifest=JSON.parse(readFileSync('src/manifest.json','utf8'));
const text=existsSync('.env.local')?readFileSync('.env.local','utf8'):'';
const value=text.match(/^VITE_RADAR_API_BASE=(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'')||process.env.VITE_RADAR_API_BASE;
const missing=[];
const cloudEnv=text.match(/^VITE_WECHAT_CLOUD_ENV=(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'')||process.env.VITE_WECHAT_CLOUD_ENV;
if(!/^wx[a-f0-9]{16}$/i.test(manifest['mp-weixin']?.appid||''))missing.push('Real WeChat AppID in src/manifest.json');
if(!cloudEnv)try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/api'))throw 0;}catch{missing.push('VITE_WECHAT_CLOUD_ENV or a public HTTPS VITE_RADAR_API_BASE ending in /api');}
if(missing.length){console.error('Release configuration incomplete:\n'+missing.map(x=>' - '+x).join('\n'));process.exitCode=1;}else console.log('Client release configuration passes. Server credentials, template fields and device delivery still need real environment verification.');
