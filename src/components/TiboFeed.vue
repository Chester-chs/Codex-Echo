<template>
  <section class="pulse-history tibo-feed">
    <div class="pulse-section-heading"><div><h2>{{ mode==='demo'?(zh?'演示推文':'Demo posts'):(zh?'Tibo 推文':'Tibo’s posts') }}</h2><p>{{ zh?'已收录 '+posts.length+' 条 · 按发布时间倒序':'All '+posts.length+' collected posts · Newest first' }}</p></div><a v-if="mode!=='demo'" href="https://x.com/thsottiaux" target="_blank" rel="noopener noreferrer" class="pulse-link">{{ zh?'查看完整时间线':'Full timeline on X' }}<AppIcon name="arrow-up-right" /></a></div>
    <div class="pulse-history-card">
      <div class="pulse-history-tools"><div class="pulse-filters"><WebButton v-for="item in filters" :key="item.key" class="base-button" :class="{active:filter===item.key}" :aria-pressed="filter===item.key" @click="filter=item.key">{{ item.label }}</WebButton></div><label class="pulse-search"><span class="pulse-visually-hidden">{{ zh?'搜索推文':'Search posts' }}</span><AppIcon name="search" /><input v-model="query" :placeholder="zh?'搜索推文或日期…':'Search posts or dates…'" /><WebButton v-if="query" class="base-button pulse-icon-button" @click="query=''" :aria-label="zh?'清空搜索':'Clear search'"><AppIcon name="x" /></WebButton></label></div>
      <div class="tibo-post-list"><article v-for="record in filtered.slice(0,limit)" :key="record.id" class="tibo-post"><span class="tibo-avatar" aria-hidden="true">T</span><div class="tibo-post-body"><div class="tibo-post-header"><strong>{{ mode==='demo'?(zh?'演示来源':'Demo source'):'Tibo' }} <span v-if="mode!=='demo'">@thsottiaux</span></strong><time>{{ time(record.postedAt) }} · {{ zoneName }}</time></div><p>{{ displayText(record,language) }}</p><div class="tibo-post-footer"><span class="pulse-type" :class="record.type">{{ label(record.resetTypes?.length>1?'mixed':record.type) }}</span><WebButton class="base-button pulse-link" @click="$emit('detail',record)">{{ zh?'阅读全文':'Read full post' }}<AppIcon name="arrow-up-right" /></WebButton></div></div></article><p v-if="!filtered.length" class="pulse-no-matches">{{ zh?'没有符合条件的推文':'No matching posts' }}</p></div>
      <div class="pulse-history-footer"><span>{{ zh?'已显示':'Showing' }} {{ Math.min(limit,filtered.length) }} / {{ filtered.length }}</span><WebButton v-if="limit<filtered.length" class="base-button pulse-link" @click="limit+=8">{{ zh?'加载更多':'Load more' }} ↓</WebButton></div>
    </div>
    <p class="tibo-coverage">{{ zh?'展示免费公开来源已收录的全部推文，包含重置公告、预测线索和其他动态；尚未覆盖 Tibo 的完整历史，可能存在遗漏。':'Shows every post collected from free public sources, including resets, forecast signals and other updates. This is not a complete archive of Tibo’s account.' }}</p>
  </section>
</template>
<script setup>
import {computed,ref,watch} from 'vue';
import WebButton from './WebButton.vue';
import AppIcon from './AppIcon.vue';
import {displayText} from '../lib/localized-content.mjs';
import {filterRecords} from '../lib/domain.mjs';
const props=defineProps(['mode','posts','language','time','zone','zoneName']);
defineEmits(['detail']);
const zh=computed(()=>props.language==='zh');
const filter=ref('all'),query=ref(''),limit=ref(6);
const filters=computed(()=>[{key:'all',label:zh.value?'全部推文':'All posts'},{key:'reset',label:zh.value?'重置公告':'Resets'},{key:'forecastSignal',label:zh.value?'预测线索':'Forecasts'},{key:'post',label:zh.value?'其他动态':'Other posts'}]);
const label=type=>({scheduled:zh.value?'重置计划':'Planned reset',automatic:zh.value?'全局重置':'Global reset',banked:zh.value?'重置券':'Reset credit',unknown:zh.value?'重置公告':'Reset post',forecastSignal:zh.value?'预测线索':'Forecast signal',post:zh.value?'普通动态':'General update',mixed:zh.value?'全局重置 + 重置券':'Global + reset credit'})[type];
const filtered=computed(()=>filterRecords(props.posts.map(r=>({...r,translation:displayText(r,'zh')})).filter(r=>filter.value==='all'||(filter.value==='reset'?['scheduled','automatic','banked','unknown'].includes(r.type):r.type===filter.value)),'all',query.value,props.zone));
watch([filter,query],()=>{limit.value=6;});
</script>
