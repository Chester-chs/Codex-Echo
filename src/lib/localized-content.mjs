import {archivedTranslations} from './translations-zh.mjs';
export function chineseText(original,provided='') {
 if(archivedTranslations[original])return archivedTranslations[original];
 if(typeof provided==='string'&&provided.trim()&&(/[\u3400-\u9fff]/.test(provided)||!/[A-Za-z]/.test(provided)))return provided;
 if(typeof original==='string'&&/[\u3400-\u9fff]/.test(original))return original;
 return '中文译文正在准备中，可展开查看原文。';
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
