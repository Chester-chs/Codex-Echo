<template>
  <view class="forecast-card panel">
    <view class="card-eyebrow"
      ><AppIcon name="activity" /><text>{{ t("forecastLabel") }}</text
      ><text v-if="mode === 'demo'" class="mini-badge">{{
        t("demoShort")
      }}</text></view
    ><text class="card-title">{{ t("forecast") }}</text>
    <template v-if="forecast"
      ><view class="probability"
        ><text>{{ Math.round(forecast.probability) }}</text
        ><text class="percent">%</text
        ><view class="probability-label">{{ t("probability") }}</view></view
      ><view class="probability-track"
        ><view :style="{ width: forecast.probability + '%' }" /></view
      ><text class="window-label">{{ t(forecast.kind === 'source-watch' ? 'sourceWindow' : 'forecastWindow') }}</text
      ><text v-if="forecast.kind === 'source-watch'" class="window-date">{{ forecast.windowText === 'within 24h' ? t('within24h') : forecast.windowText }}</text
      ><text v-else class="window-date"
        >{{ time(forecast.windowStart).slice(5) }} — {{ time(forecast.windowEnd).slice(5) }}</text
      ><text class="muted small"
        >{{ zoneName }} · {{ t("forecastDisclaimer") }}</text
      ><text v-if="forecast.kind === 'source-watch'" class="forecast-attribution">{{ t('watchAttribution') }} · {{ t('expires') }} {{ time(forecast.validUntil).slice(5) }}</text
      ><button
        role="button"
        class="base-button forecast-button"
        @click="emit('inspect')"
      >
        {{ t("forecastBasis") }}<AppIcon name="arrow-up-right" /></button
    ></template>
    <template v-else
      ><view class="forecast-placeholder"
        ><text>—</text
        ><view class="placeholder-dots"
          ><view /><view /><view /><view /><view /><view /><view /></view></view
      ><text class="empty-forecast-title">{{ t("noForecast") }}</text
      ><text class="card-description">{{ t("noForecastBody") }}</text></template
    >
    <button role="button" class="base-button text-button forecast-history-link" @click="emit('history')">{{ t('forecastHistory') }}<AppIcon name="history" /></button>
  </view>
</template>
<script setup>
import AppIcon from "./AppIcon.vue";
defineProps(["t", "forecast", "mode", "time", "zoneName"]);
const emit = defineEmits(["inspect", "history"]);
</script>
