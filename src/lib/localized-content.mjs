import {archivedTranslations} from './translations-zh.mjs';
export function needsChineseTranslation(text='') {
 const prose=String(text).replace(/https?:\/\/\S+|@[\w]+|\b(?:GPT-[\w.-]+|Codex|ChatGPT(?: Work)?|OpenAI|Tibo|Sol|Astra|Luna|AIPlanWatch|FxEmbed)\b/gi,'');
 return /\p{L}/u.test(prose)&&!/[\u3400-\u9fff]/.test(text);
}
export function chineseText(original,provided='') {
 if(archivedTranslations[original])return archivedTranslations[original];
 if(typeof provided==='string'&&provided.trim()&&!provided.includes('中文译文正在准备中')&&(/[\u3400-\u9fff]/.test(provided)||!/[A-Za-z]/.test(provided)))return provided;
 if(typeof original==='string'&&/[\u3400-\u9fff]/.test(original))return original;
 if(typeof original!=='string'||!original.trim())return '暂无可显示的推文原文。';
 if(!needsChineseTranslation(original))return original;
 return '【暂无中文译文，以下为原文】\n'+original;
}
export function localizedWindow(value,language='zh') {
 if(language!=='zh')return value||'';
 if(/[\u3400-\u9fff]/.test(value||''))return value;
 const hours=value?.match(/^within\s+(\d+)\s*(?:h|hours?)$/i);
 if(hours)return `未来 ${hours[1]} 小时内`;
 return ({tomorrow:'明天（以来源记录时刻为准）',today:'今天（以来源记录时刻为准）'})[value?.toLowerCase()]||'具体时间请查看预测依据';
}
export function displayText(record,language='zh') {
 return language==='zh'?chineseText(record.original||record.context,record.translation):record.original||record.context||'Original text unavailable';
}

export function sourceTextKey(record){
 return record?.textStatus==='mirror'&&['https://codex-reset.com/api/feed','https://codex-reset.com/tibo/x'].includes(record.textSource)?'text_codexreset':'text_'+record?.textStatus;
}
