<template>
  <main class="pulse-page">
    <header class="pulse-header">
      <div class="pulse-identity"><img src="/static/pulse.png" alt="" /><span class="pulse-wordmark">{{ t('siteName') }}<span>.</span></span><span class="pulse-product">{{ settings.language==='zh'?'Codex 雷达':'CODEX RADAR' }}</span></div>
      <div class="pulse-controls">
        <WebButton class="base-button pulse-zone" @click="$emit('zone')" :aria-label="t('timezone')"><AppIcon name="globe-2" />{{ zoneName }}</WebButton>
        <WebButton class="base-button pulse-language" @click="$emit('language')" :aria-label="settings.language==='zh'?'切换语言':'Switch language'"><span :class="{on:settings.language==='zh'}">中</span><span>/</span><span :class="{on:settings.language==='en'}">EN</span></WebButton>
        <WebButton class="base-button pulse-icon-button" @click="$emit('settings')" :aria-label="t('settings')"><AppIcon name="settings-2" /></WebButton>
      </div>
    </header>

    <section class="pulse-intro">
      <div><h1>{{ c('overviewTitle') }}</h1><p>{{ c('overviewSubtitle') }}</p></div>
      <div class="pulse-sync"><span :class="['pulse-dot', {muted:mode!=='live'}]"></span><span>{{ t(mode) }}</span><WebButton class="base-button pulse-icon-button" :disabled="loading" @click="$emit('refresh')" :aria-label="t(loading?'refreshing':'refresh')"><AppIcon name="refresh-cw" :class="{spinning:loading}" /></WebButton></div>
    </section>
    <div v-if="['cached','stale','unavailable','degraded','demo'].includes(mode)" class="pulse-notice" role="status"><AppIcon name="info" />{{ t(mode==='demo'?'demoNote':mode==='cached'?'cacheNote':mode==='stale'?'staleNote':mode==='degraded'?'degradedNote':'errorNote') }}</div>

    <section class="pulse-highlights" :class="{'has-plan':plan}">
      <ResetPlanCard v-if="plan" :plan="plan" :language="settings.language" :time="time" :zoneName="zoneName" :stale="!['live','degraded'].includes(mode)" @detail="$emit('detail',$event)" />
      <article class="pulse-latest">
        <div class="pulse-latest-heading"><span><span class="pulse-light-dot"></span>{{ c('latestReset') }}</span><span v-if="latestReset" class="pulse-hero-type">{{ latestReset.record?recordLabel(latestReset.record):c(latestReset.basis==='observed'?'resetObserved':'resetConfirmed') }}</span></div>
        <div v-if="latestReset" class="pulse-last-date" :class="{'is-relative':latestTime.relative}"><span class="pulse-big-date">{{ latestTime.primary }}</span><span v-if="latestTime.year" class="pulse-year">{{ latestTime.year }}</span></div>
        <div v-else class="pulse-no-date">{{ loading ? t('loading') : c('noReset') }}</div>
        <div class="pulse-latest-meta" v-if="latestReset"><span>{{ time(new Date(latestReset.at).toISOString()) }} <span class="pulse-zone-label">{{ zoneName }}</span></span></div>
        <div class="pulse-hero-bottom"><span>{{ latestReset?c('resetBasis_'+latestReset.basis):c('completionUnknown') }}</span><a v-if="latestReset?.sourceUrl" :href="latestReset.sourceUrl" target="_blank" rel="noopener noreferrer" class="pulse-reset-source">{{ c('viewResetSource') }}<AppIcon name="arrow-up-right" light /></a><WebButton v-else class="base-button" :disabled="!latestReset?.record" @click="$emit('detail',latestReset.record)">{{ c('readOriginal') }}<AppIcon name="arrow-up-right" light /></WebButton></div>
      </article>
      <article v-if="!plan" class="pulse-forecast">
        <div class="pulse-card-heading"><h2>{{ c('sourceForecast') }}</h2><AppIcon name="activity" /></div>
        <template v-if="forecast">
          <div class="pulse-forecast-value"><strong>{{ forecast.probability }}<small>%</small></strong><span>{{ c('sourceEstimate') }}<br /><span class="pulse-provider">{{ mode==='demo' ? t('demoShort') : forecast.kind==='source-watch' ? (forecast.provider || 'AIPlanWatch') + (settings.language==='zh'?' · 观察预测':' · Watch') : t('forecastLabel') }}</span></span></div>
          <div class="pulse-probability-track"><span :style="{width:forecast.probability+'%'}"></span></div>
          <p class="pulse-forecast-window">{{ forecast.kind==='source-watch' ? localizedWindow(forecast.windowText,settings.language) : time(forecast.windowStart)+' — '+time(forecast.windowEnd) }}</p>
          <p class="pulse-small">{{ c('forecastRecorded') }} {{ time(forecast.publishedAt) }} · {{ zoneName }}</p>
          <p class="pulse-small">{{ c('forecastUntil') }} {{ time(forecast.validUntil) }} · {{ zoneName }}</p>
          <p v-if="forecast.kind==='source-watch'" class="pulse-window-anchor">{{ c('windowAnchor') }}</p>
          <div class="pulse-forecast-links"><WebButton class="base-button pulse-link" @click="$emit('forecast')">{{ c('forecastDetails') }}<AppIcon name="arrow-up-right" /></WebButton><WebButton class="base-button pulse-link" @click="$emit('archive')">{{ t('forecastHistory') }}<AppIcon name="history" /></WebButton></div>
        </template>
        <template v-else><p class="pulse-forecast-empty">—</p><h3>{{ c('forecastUnavailable') }}</h3><p class="pulse-small">{{ c('forecastUnavailableHelp') }}</p><WebButton class="base-button pulse-link" @click="$emit('archive')">{{ t('forecastHistory') }}<AppIcon name="history" /></WebButton></template>
      </article>
    </section>

    <section class="pulse-stats" :aria-label="c('statsScope')">
      <div><span>{{ c('totalAnnouncements') }}</span><strong>{{ overview.total }}</strong></div>
      <div><span><i class="pulse-dot"></i>{{ c('automaticTotal') }}</span><strong>{{ overview.automatic }}</strong></div>
      <div><span><i class="pulse-dot banked"></i>{{ c('bankedTotal') }}</span><strong>{{ overview.banked }}</strong><p class="pulse-stat-help">{{ c('bankedCountHelp') }}</p></div>
      <div><span>{{ c('recordedDays') }}</span><strong>{{ overview.recordedDays }}<small>{{ c('dayWord') }}</small></strong></div>
    </section>
    <p class="pulse-stats-note"><span>{{ c('statsScope') }} {{ overview.mixed ? overview.mixed+' '+c('mixedScope') : '' }} {{ unknownCount ? (settings.language==='zh' ? '另有 '+unknownCount+' 条公告类型未标明。' : unknownCount+' announcement(s) have an unspecified type.') : '' }}</span><span v-if="overview.first">{{ c('since') }} {{ time(overview.first.postedAt).slice(0,10) }}</span></p>

    <section class="pulse-calendar-section">
      <div class="pulse-section-heading"><div><h2>{{ c('calendar') }}</h2><p>{{ c('calendarBasis') }} · {{ zoneName }}</p></div><WebButton class="base-button pulse-link" :disabled="!overview.latest" @click="goLatest">{{ c('latestDay') }}<AppIcon name="arrow-right" /></WebButton></div>
      <div class="pulse-calendar-card">
        <div class="pulse-calendar-main">
          <div class="pulse-month-toolbar"><h3 aria-live="polite">{{ monthLabel }}</h3><div><WebButton class="base-button pulse-today" @click="goToday">{{ c('currentMonth') }}</WebButton><WebButton class="base-button pulse-icon-button" @click="changeMonth(-1)" :aria-label="c('previousMonth')"><AppIcon name="chevron-right" class="pulse-prev" /></WebButton><WebButton class="base-button pulse-icon-button" @click="changeMonth(1)" :aria-label="c('nextMonth')"><AppIcon name="chevron-right" /></WebButton></div></div>
          <div class="pulse-weekdays"><span v-for="weekday in c('weekdays')" :key="weekday">{{ weekday }}</span></div>
          <div class="pulse-calendar-grid" :aria-label="monthLabel">
            <template v-for="(cell,index) in calendar.cells" :key="cell?.key||index"><WebButton v-if="cell" class="base-button pulse-day" :class="{selected:selectedDay===cell.key,hasRecords:cell.records.length,today:cell.today,planned:cell.planned}" :aria-label="cell.key+' · '+countLabel(cell.records.length)+(cell.today?' · '+c('today'):'')+(cell.planned?' · '+c('plannedReset'):'')" :aria-pressed="selectedDay===cell.key" :aria-current="cell.today?'date':undefined" @click="selectedDay=cell.key"><span>{{ cell.day }}</span><div class="pulse-day-dots"><i v-for="type in cell.types" :key="type" class="pulse-dot" :class="type"></i><i v-if="cell.planned" class="pulse-dot planned"></i></div><b v-if="cell.records.length>1" class="pulse-day-count">{{ cell.records.length }}</b></WebButton><span v-else class="pulse-day-blank"></span></template>
          </div>
          <div class="pulse-calendar-legend"><span><i class="pulse-dot"></i>{{ c('automaticShort') }}</span><span><i class="pulse-dot banked"></i>{{ c('bankedShort') }}</span><span v-if="plan&&['scheduled','awaiting'].includes(plan.phase)"><i class="pulse-dot planned"></i>{{ c('plannedReset') }}</span><span v-if="overview.records.some(r=>r.type==='unknown')"><i class="pulse-dot unknown"></i>{{ c('unknownShort') }}</span><span class="pulse-today-key"><i></i>{{ c('today') }}</span><span class="pulse-month-total">{{ c('monthSummary') }} <b>{{ calendar.total }}</b></span></div>
        </div>
        <aside class="pulse-day-detail" aria-live="polite">
          <div class="pulse-day-detail-heading"><span>{{ selectedDayLabel }}</span><span>{{ countLabel(selectedRecords.length) }}</span></div>
          <div v-if="selectedPlan" class="pulse-planned-day"><strong>{{ c('plannedReset') }}</strong><p>{{ time(plan.scheduledAt) }} · {{ zoneName }}</p><p>{{ c('plannedNotCompleted') }}</p><WebButton class="base-button pulse-link" @click="$emit('detail',plan.record)">{{ c('planOriginal') }} ↗</WebButton></div>
          <div v-if="!selectedRecords.length&&!selectedPlan" class="pulse-empty-day"><AppIcon name="history" /><h3>{{ c('noDayRecords') }}</h3><p>{{ c('noDayHint') }}</p></div>
          <div v-if="selectedRecords.length" class="pulse-day-posts"><article v-for="record in selectedRecords" :key="record.id"><div class="pulse-record-top"><span class="pulse-type" :class="record.type">{{ recordLabel(record) }}</span><span>{{ time(record.postedAt).slice(11) }} · {{ zoneName }}</span></div><p class="pulse-day-quote">{{ excerpt(record) }}</p><div class="pulse-day-post-footer"><span>{{ record.author }}</span><WebButton class="base-button pulse-link" @click="$emit('detail',record)">{{ c('viewRecord') }}<AppIcon name="arrow-up-right" /></WebButton></div></article></div>
          <p class="pulse-calendar-footnote">{{ t('heroDescription') }}</p>
        </aside>
      </div>
    </section>

    <TiboFeed :mode="mode" :posts="posts.length ? posts : [...overview.records,...signals].sort((a,b)=>Date.parse(b.postedAt)-Date.parse(a.postedAt))" :language="settings.language" :time="time" :zone="settings.zone" :zoneName="zoneName" @detail="$emit('detail',$event)" />
    <slot name="cloud-notifications" />

    <details class="pulse-notifications"><summary><span><AppIcon name="bell" /><strong>{{ c('notifications') }}</strong><span v-if="webArmed" class="pulse-enabled">{{ t('webMonitoring') }}</span><small v-else>{{ c('notificationsHint') }}</small></span><span class="pulse-expand">+</span></summary><div class="pulse-notification-content"><slot name="notifications" /></div></details>
    <footer class="pulse-footer"><span>{{ t('siteName') }}<span class="pulse-footer-dot">.</span> <small>{{ c('footerNote') }}</small> <a href="https://codex-reset.com" target="_blank" rel="noopener noreferrer" class="pulse-link">{{ t('codexResetCredit') }}</a></span><div><span>{{ c('updated') }} {{ time(checkedAt) }} · {{ zoneName }}</span><WebButton class="base-button pulse-link" @click="$emit('about')">{{ c('dataDetails') }}<AppIcon name="arrow-up-right" /></WebButton></div></footer>
  </main>
</template>

<script setup>
import {computed,ref,watch} from 'vue';
import AppIcon from './AppIcon.vue';
import WebButton from './WebButton.vue';
import TiboFeed from './TiboFeed.vue';
import ResetPlanCard from './ResetPlanCard.vue';
import {getResetPlanState} from '../lib/reset-plan.mjs';
import {latestResetInfo,resetTimeLabel} from '../lib/latest-reset.mjs';
import {displayText,localizedWindow} from '../lib/localized-content.mjs';
import {dayKey,resetOverview,monthGrid,moveMonth} from '../lib/calendar.mjs';
import {overviewMessages} from '../lib/overview-i18n.js';
const props=defineProps(['posts','records','signals','forecast','mode','checkedAt','now','settings','t','time','zoneName','loading','webArmed','resetConfirmation']);
defineEmits(['zone','language','settings','refresh','detail','forecast','archive','about']);
const c=key=>overviewMessages[props.settings.language][key];
const countLabel=count=>props.settings.language==='zh'?count+' 条':count+' '+(count===1?'post':'posts');
const overview=computed(()=>resetOverview(props.records,props.settings.zone,props.now));
const latestReset=computed(()=>latestResetInfo(overview.value.records,props.posts,props.resetConfirmation,props.now));
const latestTime=computed(()=>latestReset.value?resetTimeLabel(latestReset.value.at,props.now,props.settings.language,props.settings.zone):null);
const plan=computed(()=>{
 const state=props.mode==='demo'?null:getResetPlanState(props.posts.length?props.posts:props.records,props.now,props.resetConfirmation);
 return state?.showCard?state:null;
});
const unknownCount=computed(()=>overview.value.unknown);
const recordLabel=record=>props.t(record.resetTypes?.length>1?'mixedReset':record.type);
const today=computed(()=>dayKey(props.now,props.settings.zone));
const latestDayKey=computed(()=>overview.value.latest?dayKey(overview.value.latest.postedAt,props.settings.zone):null);
const month=ref(today.value.slice(0,7)),selectedDay=ref(today.value);
let initialized=false;
watch(latestDayKey,key=>{if(key&&!initialized){month.value=key.slice(0,7);selectedDay.value=key;initialized=true;}},{immediate:true});
const calendar=computed(()=>monthGrid(month.value,overview.value,today.value,plan.value,props.settings.zone));
const selectedPlan=computed(()=>plan.value&&['scheduled','awaiting'].includes(plan.value.phase)&&dayKey(plan.value.scheduledAt,props.settings.zone)===selectedDay.value);
watch([()=>plan.value?.scheduledAt,()=>props.settings.zone],([value])=>{if(value&&['scheduled','awaiting'].includes(plan.value.phase)){month.value=dayKey(value,props.settings.zone).slice(0,7);selectedDay.value=dayKey(value,props.settings.zone);}},{immediate:true});
const selectedRecords=computed(()=>overview.value.byDay[selectedDay.value]||[]);
const locale=computed(()=>props.settings.language==='zh'?'zh-CN':'en-GB');
const monthLabel=computed(()=>new Intl.DateTimeFormat(locale.value,{year:'numeric',month:'long',timeZone:'UTC'}).format(new Date(month.value+'-01T12:00:00Z')));
const selectedDayLabel=computed(()=>new Intl.DateTimeFormat(locale.value,{month:'long',day:'numeric',weekday:'short',timeZone:'UTC'}).format(new Date(selectedDay.value+'T12:00:00Z')));
function goLatest(){if(latestDayKey.value){month.value=latestDayKey.value.slice(0,7);selectedDay.value=latestDayKey.value;}}
function goToday(){month.value=today.value.slice(0,7);selectedDay.value=today.value;}
function changeMonth(offset){month.value=moveMonth(month.value,offset);selectedDay.value=Object.keys(overview.value.byDay).filter(key=>key.startsWith(month.value+'-')).sort().at(-1)||month.value+'-01';}
const excerpt=record=>displayText(record,props.settings.language);
</script>
