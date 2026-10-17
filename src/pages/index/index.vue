<template>
  <view
    class="app-shell"
    @keydown.esc="closeModal"
    :class="{ english: settings.language === 'en', 'is-weixin': isWeixin }"
  >
    <!-- #ifdef H5 -->
    <ResetOverview :posts="feed.posts || []" :records="records" :signals="signals" :forecast="forecast" :mode="mode" :checkedAt="checkedAt" :now="now" :settings="settings" :t="t" :time="time" :zoneName="zoneName" :loading="loading" :webArmed="webArmed" @zone="cycleZone" @language="toggleLanguage" @settings="showSettings=true" @refresh="refresh" @detail="openDetail" @forecast="showForecast=true" @archive="openForecastHistory" @about="showAbout=true">
      <template #cloud-notifications><BarkSubscription :language="settings.language" /></template>
      <template #notifications>
        <view  class="alerts-grid"
          ><view class="panel alert-preferences"
            ><view class="preference-row"
              ><view class="preference-icon"><AppIcon name="zap" /></view
              ><view class="preference-copy"
                ><text>{{ t("resetAlerts") }}</text
                ><text>{{ t("resetHelp") }}</text></view
              ><switch
                :checked="settings.resetAlerts"
                :disabled="authorizing"
                :color="isWeixin?'#327761':'#3e63dd'"
                @change="settings.resetAlerts = $event.detail.value"
                :aria-label="t('resetAlerts')" /></view
            ><view class="preference-row"
              ><view class="preference-icon violet"
                ><AppIcon name="activity" /></view
              ><view class="preference-copy"
                ><text>{{ t("forecastAlerts") }}</text
                ><text>{{ t("forecastHelp") }}</text></view
              ><switch
                :checked="settings.forecastAlerts"
                :disabled="authorizing"
                :color="isWeixin?'#327761':'#3e63dd'"
                @change="settings.forecastAlerts = $event.detail.value"
                :aria-label="t('forecastAlerts')" /></view
            ><view class="threshold-section"
              ><view class="panel-title-row"
                ><text class="section-title small-title">{{
                  t("threshold")
                }}</text
                ><text class="threshold-value"
                  >{{ settings.threshold }}<text>%</text></text
                ></view
              ><slider
                :value="settings.threshold"
                :disabled="authorizing"
                :min="40"
                :max="90"
                :step="5"
                :activeColor="isWeixin?'#327761':'#3e63dd'"
                backgroundColor="#e3eae4"
                :block-size="22"
                @change="settings.threshold = $event.detail.value"
                :aria-label="t('threshold')"
              /><view class="range-labels"
                ><text v-for="value in [40, 50, 60, 70, 80, 90]" :key="value">{{ value }}%</text></view
              ><text class="card-description">{{ t("thresholdHelp") }}</text
              ><view v-if="!forecast" class="prediction-warning"
                ><AppIcon name="info" /><text>{{
                  t("noPredictionPush")
                }}</text></view
              ></view
            ><view class="authorization"
              ><button
                role="button"
                class="base-button primary-button"
                @click="isWeixin ? authorize() : toggleWebMonitor()"
                :disabled="authorizing"
              >
                <AppIcon name="bell" light />{{ t(isWeixin ? (authorizing ? 'saving' : 'authorize') : (webArmed ? 'pauseWebMonitor' : 'startWebMonitor')) }}</button
              ><button v-if="isWeixin" role="button" class="base-button text-button manage-subscription" @click="manageSubscription">{{ t('manageSubscription') }}</button><button v-if="!isWeixin && systemNotificationsAvailable" role="button" class="base-button text-button manage-subscription" @click="allowBrowserNotifications">{{ t('allowBrowserNotifications') }}</button><button v-if="isWeixin" role="button" class="base-button text-button" @click="removeSubscription">{{ t('deleteSubscription') }}</button><text class="local-save"
                ><AppIcon name="check" />{{ t(subscription ? 'serverSaved' : 'localOnly') }}</text
              ><text v-if="!isWeixin" class="notification-guide">{{ t('pageAlertSteps') }}</text><text v-if="!isWeixin" class="notification-guide">{{ t('phoneReminderHelp') }}</text></view
            ></view
          ><view class="alerts-aside"
            ><view class="panel how-card"
              ><view class="how-icon"><AppIcon name="bell" /></view
              ><text class="card-title">{{ t(isWeixin ? (serverStatus?.wechat?.ready ? 'pushReady' : 'notConnected') : (webArmed ? 'webMonitoring' : 'webMonitorReady')) }}</text
              ><text class="card-description">{{ t(isWeixin ? (serverStatus?.wechat?.ready ? 'pushReadyHelp' : 'notConnectedHelp') : 'webMonitorHelp') }}</text
              ><view v-if="subscription" class="subscription-state"><text>{{ t('resetAlerts') }} · {{ subscription.resetCredits ? t('availableOnce') : t('needsConsent') }}</text><text>{{ t('forecastAlerts') }} · {{ subscription.forecastCredits ? t('availableOnce') : t('needsConsent') }}</text><button role="button" class="base-button text-button" @click="removeSubscription">{{ t('deleteSubscription') }}</button></view
              ><view class="soft-divider" /><text class="small-title">{{
                t("quiet")
              }}</text
              ><text class="card-description">{{ t(isWeixin ? "quietHelp" : "webQuietHelp") }}</text></view
            ><view v-if="!isWeixin" class="panel delivery-card"><text class="section-title small-title">{{ t('webActivity') }}</text><text v-if="!webNotices.length" class="card-description">{{ t('noWebActivity') }}</text><view v-for="notice in webNotices" :key="notice.at+notice.key" class="delivery-row"><text>{{ t(notice.kind==='reset' ? 'resetAlerts' : 'forecastAlerts') }}</text><text class="small muted">{{ time(notice.at) }}</text><button class="base-button text-button" @click="openWebNotice(notice)">{{ t('viewDetail') }}</button></view></view
            ><view v-if="subscription" class="panel delivery-card"><view class="panel-title-row"><text class="section-title small-title">{{ t('deliveryHistory') }}</text><button role="button" class="base-button text-button" @click="loadSubscription">{{ t('refresh') }}</button></view><text v-if="!deliveries.length" class="muted small">{{ t('noDeliveries') }}</text><view v-for="delivery in deliveries" :key="delivery.id" class="delivery-row"><text>{{ t(delivery.kind === 'reset' ? 'resetAlerts' : 'forecastAlerts') }}</text><text class="delivery-state">{{ t('delivery_'+delivery.state) }}</text><text class="small muted">{{ time(delivery.updatedAt) }}</text></view></view><text class="aside-signature">{{ settings.language==='zh'?'清晰的信号，从容的专注。':'less noise. more flow.' }}</text></view
          ></view
        >


      </template>
    </ResetOverview>
    <!-- #endif -->
    <view v-if="isWeixin" class="sidebar">
      <view class="brand"
        ><image src="/static/pulse.png" class="brand-mark" /><view
          ><text class="wordmark">{{ t('siteName') }}<text class="brand-dot">.</text></text
          ><text class="brand-caption">{{ t("brand") }}</text></view
        ></view
      >
      <text class="nav-caption">{{ t("workspace") }}</text>
      <view class="desktop-nav">
        <button
          role="button"
          class="base-button"
          v-for="item in navItems"
          :key="item.key"
          :class="['nav-item', { active: tab === item.key }]"
          @click="navigate(item.key)"
        >
          <AppIcon :name="item.icon" /><text>{{ t(item.key) }}</text
          ><view v-if="tab === item.key" class="nav-dot" />
        </button>
      </view>
      <view class="sidebar-bottom">
        <view class="focus-note"
          ><view class="tiny-radar"><view /></view
          ><text>{{ t("tagline") }}</text></view
        >
        <button
          role="button"
          class="base-button nav-item"
          @click="showSettings = true"
        >
          <AppIcon name="settings-2" /><text>{{ t("settings") }}</text>
        </button>
        <text class="version">{{ t("version") }}</text>
      </view>
    </view>

    <view v-if="isWeixin" class="workspace">
      <view
        class="topbar"
        :style="isWeixin ? { paddingTop: topInset + 'px' } : {}"
      >
        <view class="breadcrumb"
          ><text class="desktop-only">{{ t('siteName') }}</text
          ><text class="breadcrumb-slash desktop-only">/</text
          ><text>{{ t(tab) }}</text
          ><view class="preview-tag">{{ t(isWeixin ? "previewBadge" : "webBadge") }}</view></view
        >
        <view class="topbar-actions">
          <button
            role="button"
            class="base-button zone-button"
            @click="cycleZone"
          >
            <AppIcon name="globe-2" /><text>{{ zoneName }}</text>
          </button>
          <button
            role="button"
            class="base-button language-button"
            @click="toggleLanguage"
            aria-label="Switch language"
          >
            <text :class="{ selected: settings.language === 'zh' }">中</text
            ><text class="language-divider">/</text
            ><text :class="{ selected: settings.language === 'en' }">EN</text>
          </button>
          <button
            role="button"
            class="base-button icon-button mobile-settings"
            @click="showSettings = true"
            :aria-label="t('settings')"
          >
            <AppIcon name="settings-2" />
          </button>
        </view>
      </view>

      <view class="main-content">
        <view class="page-heading"
          ><view
            ><text class="eyebrow">{{ t("eyebrow") }}</text
            ><text class="page-title">{{
              t(
                tab === "radar"
                  ? "title"
                  : tab === "history"
                    ? "historyTitle"
                    : "alertsTitle",
              )
            }}</text
            ><text class="page-subtitle">{{
              t(
                tab === "radar"
                  ? "subtitle"
                  : tab === "history"
                    ? "historySubtitle"
                    : "alertsSubtitle",
              )
            }}</text></view
          ><button
            role="button"
            v-if="tab !== 'alerts'"
            class="base-button refresh-button"
            @click="refresh"
            :disabled="loading"
          >
            <AppIcon name="refresh-cw" :class="{ spinning: loading }" /><text>{{
              t(loading ? "refreshing" : "refresh")
            }}</text>
          </button></view
        >
        <view
          v-if="mode === 'demo' || mode === 'cached' || mode === 'unavailable' || mode === 'degraded'"
          class="notice"
          :class="mode"
          ><AppIcon name="info" /><text>{{
            t(
              mode === "demo"
                ? "demoNote"
                : mode === "cached"
                  ? "cacheNote"
                  : mode === 'degraded' ? 'degradedNote' : "errorNote",
            )
          }}</text
          ><button
            role="button"
            class="base-button"
            v-if="mode === 'demo'"
            @click="settings.demo = false"
          >
            {{ t("restoreLive") }}
          </button></view
        >

        <view v-if="tab === 'radar'" class="dashboard">
          <view class="dashboard-primary">
            <view class="hero-card">
              <view class="hero-top"
                ><view class="status-label"
                  ><view class="status-dot" /><text>{{
                    t("heroLabel")
                  }}</text></view
                ><text class="hero-chip">{{ t(mode) }}</text></view
              >
              <view class="hero-body"
                ><view class="hero-copy"
                  ><text class="hero-title">{{ t("heroTitle") }}</text
                  ><view class="latest-meta"
                    ><text>{{ t("latestPost") }}</text
                    ><view
                      ><text class="hero-date">{{
                        latest ? time(latest.postedAt) : "—"
                      }}</text
                      ><text class="hero-zone">{{ zoneName }}</text></view
                    ></view
                  ><button
                    role="button"
                    class="base-button hero-button"
                    @click="latest && openDetail(latest)"
                    :disabled="!latest"
                  >
                    {{ t("viewDetail")
                    }}<AppIcon name="arrow-up-right" /></button
                ></view>
                <view class="radar-art" aria-hidden="true"
                  ><view class="radar-circle outer" /><view
                    class="radar-circle middle"
                  /><view class="radar-circle inner" /><view
                    class="radar-line horizontal"
                  /><view class="radar-line vertical" /><view
                    class="radar-sweep"
                  /><view class="radar-center" /><view
                    class="radar-blip one"
                  /><view class="radar-blip two" /><text
                    class="radar-coordinate"
                    >SIGNAL / 01</text
                  ></view
                >
              </view>
              <view class="hero-footer"
                ><AppIcon name="shield-check" light /><text>{{
                  t("heroDescription")
                }}</text></view
              >
            </view>

            <view class="stats-grid">
              <view class="stat-card"
                ><view class="stat-heading"
                  ><text>{{ t("total") }}</text
                  ><AppIcon name="radio" /></view
                ><text class="stat-value">{{
                  records.length.toString().padStart(2, "0")
                }}</text
                ><text class="stat-note">{{ t("sourceScope") }}</text></view
              >
              <view class="stat-card"
                ><view class="stat-heading"
                  ><text>{{ t("globalCount") }}</text
                  ><AppIcon name="zap" /></view
                ><text class="stat-value">{{
                  automaticCount.toString().padStart(2, "0")
                }}</text
                ><text class="stat-note">{{ t("sourceScope") }}</text></view
              >
              <view class="stat-card"
                ><view class="stat-heading"
                  ><text>{{ t("median") }}</text
                  ><AppIcon name="clock-3" /></view
                ><text class="stat-value"
                  >{{ rhythm.medianDays ?? "—"
                  }}<text class="stat-unit">{{ t("days") }}</text></text
                ><text class="stat-note">{{ t("postedNotReset") }}</text></view
              >
            </view>

            <ForecastCard
              :t="t"
              :forecast="forecast"
              :mode="mode"
              :time="time"
              :zoneName="zoneName"
              @inspect="showForecast = true"
              @history="openForecastHistory"
              class="mobile-forecast"
            />
            <view class="section-heading"
              ><view
                ><text class="section-title">{{ t("latest") }}</text
                ><text class="section-kicker"
                  >{{ t("feedCount") }} ·
                  {{ mode === "demo" ? t("demo") : config.sourceName }}</text
                ></view
              ><button
                role="button"
                class="base-button text-button"
                @click="navigate('history')"
              >
                {{ t("viewAll") }}<AppIcon name="arrow-right" /></button
            ></view>
            <view class="signal-list">
              <button
                role="button"
                v-for="record in records.slice(0, 3)"
                :key="record.id"
                class="base-button signal-row"
                @click="openDetail(record)"
              >
                <view class="signal-icon" :class="record.type"
                  ><AppIcon
                    :name="record.type === 'banked' ? 'history' : 'zap'"
                /></view>
                <view class="signal-content"
                  ><view class="signal-title-row"
                    ><text class="signal-title">{{ t(record.type) }}</text
                    ><text class="type-badge" :class="record.type">{{
                      t(
                        record.type === "banked"
                          ? "signalTagBanked"
                          : record.type === "automatic"
                            ? "signalTagAutomatic"
                            : "signalTagUnknown",
                      )
                    }}</text></view
                  ><text class="signal-excerpt">{{ excerpt(record) }}</text
                  ><view class="signal-meta"
                    ><text>{{
                      mode === "demo" ? t("demoAuthor") : record.author
                    }}</text
                    ><text class="meta-dot">·</text
                    ><text>{{ time(record.postedAt) }}</text></view
                  ></view
                ><AppIcon name="arrow-up-right" class="row-arrow" /></button
              ><view v-if="!records.length" class="empty-state"
                ><AppIcon name="radar" /><text>{{ t("noRecords") }}</text></view
              >
            </view>
            <view v-if="signals.length" class="watch-feed">
              <view class="section-heading"><text class="section-title">{{ t('tiboUpdates') }}</text><button role="button" class="base-button text-button" @click="filter='forecastSignal'; navigate('history')">{{ t('viewAll') }}<AppIcon name="arrow-right" /></button></view>
              <button role="button" v-for="signal in signals.slice(0,2)" :key="signal.id" class="base-button watch-row" @click="openDetail(signal)"><view class="signal-title-row"><text class="type-badge forecastSignal">{{ t('forecastSignal') }}</text><text class="small muted">{{ time(signal.postedAt) }}</text></view><text class="signal-excerpt">{{ excerpt(signal) }}</text><text class="small muted">Tibo · @thsottiaux <text>↗</text></text></button>
            </view>
          </view>

          <view class="dashboard-secondary">
            <ForecastCard
              :t="t"
              :forecast="forecast"
              :mode="mode"
              :time="time"
              :zoneName="zoneName"
              @inspect="showForecast = true"
              @history="openForecastHistory"
              class="desktop-forecast"
            />
            <view class="rhythm-card panel"
              ><view class="panel-title-row"
                ><text class="section-title small-title">{{ t("rhythm") }}</text
                ><AppIcon name="activity" /></view
              ><text class="card-description compact">{{
                t("rhythmSubtitle")
              }}</text
              ><view v-if="rhythm.samples" class="rhythm-chart"
                ><view
                  v-for="(interval, index) in rhythm.intervals.slice(-7)"
                  :key="index"
                  class="rhythm-column"
                  ><text>{{ interval.toFixed(1) }}</text
                  ><view
                    class="rhythm-bar"
                    :style="{
                      height:
                        Math.max(12, (interval / maxInterval) * 68) + 'px',
                    }"
                  /><text class="chart-index">{{
                    String(index + 1).padStart(2, "0")
                  }}</text></view
                ></view
              ><view v-else class="empty-chart">{{ t("noRhythm") }}</view
              ><view class="rhythm-footer"
                ><view class="legend-dot" /><text
                  >{{ rhythm.samples }} {{ t("samples") }}</text
                ><text>{{ t("days") }}</text></view
              ><text class="chart-note">{{ t("rhythmNote") }}</text></view
            >

            <view class="source-card"
              ><view class="panel-title-row"
                ><view class="source-title"
                  ><view
                    class="connection-dot"
                    :class="{ offline: mode !== 'live' }"
                  /><text>{{ t("sourceHealth") }}</text></view
                ><text class="source-name">{{
                  mode === "demo" ? t("demoShort") : config.sourceName
                }}</text></view
              ><view class="source-timestamp"
                ><text>{{ t("checked") }}</text
                ><text>{{ time(checkedAt) }}</text></view
              ><button
                role="button"
                class="base-button text-button"
                @click="showAbout = true"
              >
                {{ t("sourceInfo") }}<AppIcon name="arrow-up-right" /></button
            ></view>
          </view>
          <view class="reminder-banner"
            ><view class="banner-icon"><AppIcon name="bell" /></view
            ><view class="banner-copy"
              ><text>{{ t("reminderTitle") }}</text
              ><text>{{ t("reminderSubtitle") }}</text></view
            ><button
              role="button"
              class="base-button"
              @click="navigate('alerts')"
            >
              {{ t("reminderCta") }}<AppIcon name="arrow-right" /></button
          ></view>
        </view>

        <view v-if="tab === 'history'" class="history-view"
          ><view class="filter-panel panel"
            ><view class="filter-tabs"
              ><button
                role="button"
                class="base-button"
                v-for="type in ['all', 'automatic', 'banked', 'forecastSignal']"
                :key="type"
                :class="{ selected: filter === type }"
                @click="filter = type"
              >
                {{ t(type) }}
              </button></view
            ><view class="search-field"
              ><AppIcon name="search" /><input
                v-model="query"
                :placeholder="t('search')"
                :aria-label="t('search')" /><button
                role="button"
                v-if="query"
                class="base-button icon-button"
                @click="query = ''"
                :aria-label="t('clearFilters')"
              >
                <AppIcon name="x" /></button></view></view
          ><view class="history-count"
            ><text>{{ filteredRecords.length }} {{ t("results") }}</text
            ><text>{{ zoneName }} · {{ t("published") }}</text></view
          ><text class="small muted post-delay-note">{{ t("postDelayNote") }}</text>
          <view class="signal-list history-list"
            ><button
              role="button"
              v-for="record in filteredRecords"
              :key="record.id"
              class="base-button signal-row"
              @click="openDetail(record)"
            >
              <view class="history-date"
                ><text>{{ time(record.postedAt).slice(5, 10) }}</text
                ><text>{{ time(record.postedAt).slice(11) }}</text></view
              ><view class="signal-icon" :class="record.type"
                ><AppIcon
                  :name="record.type === 'banked' ? 'history' : 'zap'" /></view
              ><view class="signal-content"
                ><view class="signal-title-row"
                  ><text class="signal-title">{{ t(record.type) }}</text
                  ><text class="type-badge" :class="record.type">{{
                    t(
                      record.type === "banked"
                        ? "signalTagBanked"
                        : record.type === "automatic"
                          ? "signalTagAutomatic"
                          : record.type === 'forecastSignal' ? 'forecastSignal' : "signalTagUnknown",
                    )
                  }}</text></view
                ><text class="signal-excerpt">{{ excerpt(record) }}</text
                ><text class="signal-meta"
                  >{{ mode === "demo" ? t("demoAuthor") : record.author }} · #{{
                    record.id
                  }}</text
                ></view
              ><AppIcon name="arrow-up-right" class="row-arrow" /></button
            ><view v-if="!filteredRecords.length" class="empty-state"
              ><AppIcon name="search" /><text>{{ t("emptySearch") }}</text
              ><button
                role="button"
                class="base-button text-button"
                @click="
                  filter = 'all';
                  query = '';
                "
              >
                {{ t("clearFilters") }}
              </button></view
            ></view
          ><view class="inline-note"
            ><AppIcon name="info" /><text>{{ t("coverage") }}</text></view
          >
        </view>

        <view v-if="tab === 'alerts'" class="alerts-grid"
          ><view class="panel alert-preferences"
            ><view class="preference-row"
              ><view class="preference-icon"><AppIcon name="zap" /></view
              ><view class="preference-copy"
                ><text>{{ t("resetAlerts") }}</text
                ><text>{{ t("resetHelp") }}</text></view
              ><switch
                :checked="settings.resetAlerts"
                :disabled="authorizing"
                :color="isWeixin?'#327761':'#3e63dd'"
                @change="settings.resetAlerts = $event.detail.value"
                :aria-label="t('resetAlerts')" /></view
            ><view class="preference-row"
              ><view class="preference-icon violet"
                ><AppIcon name="activity" /></view
              ><view class="preference-copy"
                ><text>{{ t("forecastAlerts") }}</text
                ><text>{{ t("forecastHelp") }}</text></view
              ><switch
                :checked="settings.forecastAlerts"
                :disabled="authorizing"
                :color="isWeixin?'#327761':'#3e63dd'"
                @change="settings.forecastAlerts = $event.detail.value"
                :aria-label="t('forecastAlerts')" /></view
            ><view class="threshold-section"
              ><view class="panel-title-row"
                ><text class="section-title small-title">{{
                  t("threshold")
                }}</text
                ><text class="threshold-value"
                  >{{ settings.threshold }}<text>%</text></text
                ></view
              ><slider
                :value="settings.threshold"
                :disabled="authorizing"
                :min="40"
                :max="90"
                :step="5"
                :activeColor="isWeixin?'#327761':'#3e63dd'"
                backgroundColor="#e3eae4"
                :block-size="22"
                @change="settings.threshold = $event.detail.value"
                :aria-label="t('threshold')"
              /><view class="range-labels"
                ><text v-for="value in [40, 50, 60, 70, 80, 90]" :key="value">{{ value }}%</text></view
              ><text class="card-description">{{ t("thresholdHelp") }}</text
              ><view v-if="!forecast" class="prediction-warning"
                ><AppIcon name="info" /><text>{{
                  t("noPredictionPush")
                }}</text></view
              ></view
            ><view class="authorization"
              ><button
                role="button"
                class="base-button primary-button"
                @click="isWeixin ? authorize() : toggleWebMonitor()"
                :disabled="authorizing"
              >
                <AppIcon name="bell" light />{{ t(isWeixin ? (authorizing ? 'saving' : 'authorize') : (webArmed ? 'pauseWebMonitor' : 'startWebMonitor')) }}</button
              ><button v-if="isWeixin" role="button" class="base-button text-button manage-subscription" @click="manageSubscription">{{ t('manageSubscription') }}</button><button v-if="!isWeixin && systemNotificationsAvailable" role="button" class="base-button text-button manage-subscription" @click="allowBrowserNotifications">{{ t('allowBrowserNotifications') }}</button><button v-if="isWeixin" role="button" class="base-button text-button" @click="removeSubscription">{{ t('deleteSubscription') }}</button><text class="local-save"
                ><AppIcon name="check" />{{ t(subscription ? 'serverSaved' : 'localOnly') }}</text
              ><text v-if="!isWeixin" class="notification-guide">{{ t('pageAlertSteps') }}</text><text v-if="!isWeixin" class="notification-guide">{{ t('phoneReminderHelp') }}</text></view
            ></view
          ><view class="alerts-aside"
            ><view class="panel how-card"
              ><view class="how-icon"><AppIcon name="bell" /></view
              ><text class="card-title">{{ t(isWeixin ? (serverStatus?.wechat?.ready ? 'pushReady' : 'notConnected') : (webArmed ? 'webMonitoring' : 'webMonitorReady')) }}</text
              ><text class="card-description">{{ t(isWeixin ? (serverStatus?.wechat?.ready ? 'pushReadyHelp' : 'notConnectedHelp') : 'webMonitorHelp') }}</text
              ><view v-if="subscription" class="subscription-state"><text>{{ t('resetAlerts') }} · {{ subscription.resetCredits ? t('availableOnce') : t('needsConsent') }}</text><text>{{ t('forecastAlerts') }} · {{ subscription.forecastCredits ? t('availableOnce') : t('needsConsent') }}</text><button role="button" class="base-button text-button" @click="removeSubscription">{{ t('deleteSubscription') }}</button></view
              ><view class="soft-divider" /><text class="small-title">{{
                t("quiet")
              }}</text
              ><text class="card-description">{{ t(isWeixin ? "quietHelp" : "webQuietHelp") }}</text></view
            ><view v-if="!isWeixin" class="panel delivery-card"><text class="section-title small-title">{{ t('webActivity') }}</text><text v-if="!webNotices.length" class="card-description">{{ t('noWebActivity') }}</text><view v-for="notice in webNotices" :key="notice.at+notice.key" class="delivery-row"><text>{{ t(notice.kind==='reset' ? 'resetAlerts' : 'forecastAlerts') }}</text><text class="small muted">{{ time(notice.at) }}</text><button class="base-button text-button" @click="openWebNotice(notice)">{{ t('viewDetail') }}</button></view></view
            ><view v-if="subscription" class="panel delivery-card"><view class="panel-title-row"><text class="section-title small-title">{{ t('deliveryHistory') }}</text><button role="button" class="base-button text-button" @click="loadSubscription">{{ t('refresh') }}</button></view><text v-if="!deliveries.length" class="muted small">{{ t('noDeliveries') }}</text><view v-for="delivery in deliveries" :key="delivery.id" class="delivery-row"><text>{{ t(delivery.kind === 'reset' ? 'resetAlerts' : 'forecastAlerts') }}</text><text class="delivery-state">{{ t('delivery_'+delivery.state) }}</text><text class="small muted">{{ time(delivery.updatedAt) }}</text></view></view><text class="aside-signature">{{ settings.language==='zh'?'清晰的信号，从容的专注。':'less noise. more flow.' }}</text></view
          ></view
        >

        <view class="page-footer"
          ><text>{{ t('siteName') }}<text>.</text></text
          ><text>{{ t("footer") }}</text
          ><button role="button" class="base-button" @click="showAbout = true">
            {{ t("about") }}<AppIcon name="arrow-up-right" /></button
        ></view>
      </view>
    </view>

    <view v-if="isWeixin" class="mobile-nav"
      ><button
        role="button"
        class="base-button"
        v-for="item in navItems"
        :key="item.key"
        :class="{ active: tab === item.key }"
        @click="navigate(item.key)"
      >
        <AppIcon :name="item.icon" /><text>{{ t(item.key) }}</text
        ><view v-if="tab === item.key" class="mobile-nav-dot" /></button
    ></view>

    <view
      v-if="
        focusedRecord || showSettings || showAbout || showForecast || showForecastHistory || message
      "
      class="modal-backdrop"
      @click="closeModal"
    >
      <view class="modal" @click.stop role="dialog" aria-modal="true">
        <view class="modal-heading"
          ><text>{{
            focusedRecord
              ? t("viewDetail")
              : showSettings
                ? t("settings")
                : showForecast
                  ? t("forecastLabel")
                  : showForecastHistory ? t('forecastHistory') : message
                    ? t("alerts")
                    : t("sourceInfo")
          }}</text
          ><button
            role="button"
            class="base-button icon-button"
            @click="closeModal"
            :aria-label="t('close')"
          >
            <AppIcon name="x" /></button
        ></view>
        <scroll-view scroll-y class="modal-scroll">
          <view v-if="focusedRecord" class="detail-view"
            ><view class="detail-top"
              ><view class="signal-icon" :class="focusedRecord.type"
                ><AppIcon
                  :name="
                    focusedRecord.type === 'banked' ? 'history' : 'zap'
                  " /></view
              ><view
                ><text class="card-title">{{ t(focusedRecord.resetTypes?.length>1?'mixedReset':focusedRecord.type) }}</text
                ><text class="muted small">{{
                  mode === "demo" ? t("demoAuthor") : focusedRecord.author
                }}</text></view
              ></view
            ><view v-if="mode === 'demo'" class="detail-demo">{{
              t("demoNote")
            }}</view
            ><view v-if="settings.language==='zh'" class="translation-block"><text class="field-label">{{ t('translation') }}</text><text>{{ displayText(focusedRecord,'zh') }}</text><text class="translation-caption">中文译文仅供理解，原帖为准。</text></view>
            <details v-if="settings.language==='zh'" class="original-disclosure"><summary>展开原文</summary><view class="quote-block"><text>{{ focusedRecord.original || t('originalMissing') }}</text></view></details>
            <view v-else><text class="field-label">{{ t('original') }}</text><view class="quote-block"><text>{{ focusedRecord.original || t('originalMissing') }}</text></view></view>
            <view v-if="mode !== 'demo'" class="source-quality" :class="focusedRecord.textStatus"><AppIcon name="info"/><text>{{ t(sourceTextKey(focusedRecord)) }}</text></view>
            <view v-if="focusedRecord.context" class="translation-block"><text class="field-label">{{ t('sourceContext') }}</text><text>{{ settings.language==='zh'?chineseText(focusedRecord.context):focusedRecord.context }}</text></view>
            <view v-if="focusedRecord.classificationNote" class="source-quality"><text>{{ t('classificationInfo') }}：{{ settings.language==='zh'?focusedRecord.classificationNoteZh:focusedRecord.classificationNote }}</text></view><text v-if="focusedRecord.timeBasis === 'post-id'" class="small muted">{{ t('postTimeDerived') }}</text
            ><view class="detail-fields"
              ><view v-if="['automatic','banked','unknown'].includes(focusedRecord.type)"
                ><text>{{ t("actualReset") }}</text
                ><text>{{
                  focusedRecord.resetAt
                    ? time(focusedRecord.resetAt)
                    : t("notStated")
                }}</text></view
              ><view v-if="focusedRecord.scheduledAt"><text>{{ settings.language==='zh'?'计划重置时间（待确认完成）':'Planned reset time (completion unconfirmed)' }}</text><text>{{ time(focusedRecord.scheduledAt) }}</text></view><view
                ><text>{{ t("published") }}</text
                ><text>{{ time(focusedRecord.postedAt) }}</text></view
              ><view
                ><text>{{ t("detected") }}</text
                ><text>{{ focusedRecord.detectedAt ? time(focusedRecord.detectedAt) : t('notStated') }}</text></view
              ><view
                ><text>{{ t("timezone") }}</text
                ><text>{{ zoneName }}</text></view
              ></view
            ><text class="source-url">{{
              mode === "demo" ? t("demoSource") : focusedRecord.url
            }}</text
            ><view class="detail-actions"
              ><button
                role="button"
                class="base-button primary-button"
                @click="openSource(focusedRecord.url)"
              >
                {{ t(isWeixin ? "copyForBrowser" : "sourceLink")
                }}<AppIcon name="external-link" light /></button
              ><button
                role="button"
                class="base-button secondary-button"
                @click="copySource(focusedRecord.url)"
              >
                <AppIcon name="copy" />{{ t("copyLink") }}
              </button></view
            ></view
          >
          <view v-else-if="showSettings" class="settings-view"
            ><text class="field-label">{{ t("language") }}</text
            ><view class="choice-group"
              ><button
                role="button"
                class="base-button"
                :class="{ selected: settings.language === 'zh' }"
                @click="settings.language = 'zh'"
              >
                简体中文</button
              ><button
                role="button"
                class="base-button"
                :class="{ selected: settings.language === 'en' }"
                @click="settings.language = 'en'"
              >
                English
              </button></view
            ><text class="field-label">{{ t("timezone") }}</text
            ><view class="choice-group"
              ><button
                role="button"
                class="base-button"
                v-for="zone in zones"
                :key="zone.value"
                :class="{ selected: settings.zone === zone.value }"
                @click="settings.zone = zone.value"
              >
                {{ t(zone.key) }}
              </button></view
            ><view class="demo-preference"
              ><view
                ><text class="small-title">{{ t("demoSwitch") }}</text
                ><text class="card-description">{{ t("demoHelp") }}</text></view
              ><switch
                :checked="settings.demo"
                :color="isWeixin?'#327761':'#3e63dd'"
                @change="settings.demo = $event.detail.value"
                :aria-label="t('demoSwitch')" /></view
            ><text class="local-save"
              ><AppIcon name="check" />{{ t("localOnly") }}</text
            ></view
          >
          <view v-else-if="showForecast && forecast" class="forecast-detail"
            ><view class="probability"
              ><text>{{ forecast.probability }}</text
              ><text class="percent">%</text></view
            ><view v-if="mode === 'demo'" class="detail-demo">{{
              t("demoNote")
            }}</view
            ><text class="field-label">{{ t("basis") }}</text
            ><view class="quote-block">{{
              settings.language === "zh" ? chineseText(forecast.basis,forecast.basisZh) : forecast.basis
            }}</view
            ><view class="detail-fields"
              ><view
                ><text>{{ t(forecast.kind === 'source-watch' ? 'sourceRecorded' : 'forecastPublished') }}</text
                ><text>{{ time(forecast.publishedAt) }}</text></view
              ><view
                ><text>{{ t("expires") }}</text
                ><text>{{ time(forecast.validUntil) }}</text></view
              ></view
            ><view v-if="forecast.kind === 'source-watch'" class="forecast-method"><text>{{ t('watchAttribution') }}</text><text>{{ t('watchExplanation') }}</text><text>{{ t('modelGate') }}</text><text>{{ t('checked') }} · {{ time(forecast.checkedAt) }}</text></view><text class="card-description">{{ t("forecastDisclaimer") }}</text
            ><button
              role="button"
              class="base-button primary-button"
              @click="openSource(forecast.sourceUrl)"
            >
              {{ t(isWeixin ? "copyForBrowser" : "sourceLink") }}
            </button></view
          >
          <view v-else-if="showForecast" class="forecast-detail"><text class="card-title">{{ t('noForecast') }}</text><text class="card-description">{{ t('noForecastBody') }}</text></view>
          <view v-else-if="showForecastHistory" class="forecast-archive"><text class="card-description">{{ t('forecastArchiveHelp') }}</text><text v-if="!forecastHistory.length" class="muted">{{ t('noForecastHistory') }}</text><view v-for="item in forecastHistory" :key="item.id+item.savedAt" class="archive-item"><view class="panel-title-row"><text class="archive-probability">{{ item.probability }}%</text><text class="type-badge">{{ t(Date.parse(item.validUntil)>now ? 'activeForecast' : 'expiredForecast') }}</text></view><text class="small muted">{{ t('sourceRecorded') }} · {{ time(item.publishedAt) }}</text><text class="archive-basis">{{ settings.language==='zh'?chineseText(item.basis,item.basisZh):item.basis }}</text><text class="small muted">{{ t('expires') }} · {{ time(item.validUntil) }}</text><button role="button" class="base-button text-button" @click="openSource(item.sourceUrl)">{{ t('sourceLink') }}<AppIcon name="external-link" /></button></view></view>
          <view v-else-if="message" class="message-view"
            ><AppIcon name="info" /><text>{{ t(message) }}</text
            ><button
              role="button"
              class="base-button primary-button"
              @click="closeModal"
            >
              {{ t("close") }}
            </button></view
          >
          <view v-else class="about-view"
            ><view class="about-brand"
              ><image src="/static/pulse.png" /><text>{{ t('siteName') }}.</text></view
            ><text class="card-description">{{ t("aboutText") }}</text
            ><text class="field-label">{{ t("sourceInfo") }}</text
            ><view class="about-source"
              ><text>{{ settings.language==='zh'?'公开重置与推文来源':config.sourceName }}</text
              ><text class="card-description">{{ t("coverage") }}</text
              ><text class="card-description">{{ t("postDelayNote") }}</text
              ><text class="small muted"
                >{{ t("polled") }}: {{ time(feed.lastPolledAt) }} ·
                {{ zoneName }}</text
              ></view
            ><view class="source-health-list"><view v-for="source in feed.sources" :key="source.name"><text>{{ settings.language==='zh'?({history:'重置公告',timeline:'重置相关推文',watch:'观察预测',builders:'普通推文',tokenusage:'重置记录','codexreset-feed':'Codex Reset · 推文接口','codexreset-timeline':'Codex Reset · 重置记录'})[source.name]||source.name:({'codexreset-feed':'Codex Reset · Post API','codexreset-timeline':'Codex Reset · Reset history'})[source.name]||source.name }}</text><text>{{ t(sourceIsFresh(source) ? 'sourceOk' : 'sourceDelayed') }} · {{ time(source.lastSuccessAt) }}</text></view></view><text class="field-label">{{ t("learn") }}</text
            ><text class="card-description">{{ t("automaticHelp") }}</text
            ><text class="card-description">{{ t("bankedHelp") }}</text
            ><view class="open-source-note"
              >{{ settings.language==='zh'?'基于 uni-app、Vue 与 Lucide 构建':'Built with uni-app · Vue · Lucide' }}</view
            ></view
          >
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import AppIcon from "../../components/AppIcon.vue";
import ForecastCard from "../../components/ForecastCard.vue";
// #ifdef H5
import ResetOverview from "../../components/ResetOverview.vue";
import BarkSubscription from "../../components/BarkSubscription.vue";
// #endif
import { messages } from "../../lib/i18n";
import {displayText,chineseText,sourceTextKey} from "../../lib/localized-content.mjs";
import { config } from "../../config";
import {
  normalizeFeed,
  filterRecords,
  getForecast,
  getRhythm,
  formatTime,
  sanitizeSettings,
  subscriptionOutcome,
} from "../../lib/domain.mjs";
import { fetchFeed } from "../../lib/feed";
import { createDemo } from "../../lib/demo";
import { api, login, hasSession, clearSession } from '../../lib/api';
import { onLoad, onShow, onHide } from '@dcloudio/uni-app';
// #ifdef H5
import {createWebMonitor,canUsePageNotifications} from '../../lib/web-alerts.mjs';
import {createClientTranslator} from '../../lib/client-translations.mjs';
// #endif

let stored = {};
let isWeixin = false,
  topInset = 0;
// #ifdef MP-WEIXIN
isWeixin = true;
topInset = uni.getWindowInfo
  ? uni.getWindowInfo().statusBarHeight
  : uni.getSystemInfoSync().statusBarHeight;
// #endif
try {
  stored = uni.getStorageSync("pulse:settings") || {};
} catch {}
const settings = reactive(sanitizeSettings(stored));
const tab = ref("radar"),
  filter = ref("all"),
  query = ref("");
const feed = ref({ records: [], forecast: null }),
  mode = ref("loading"),
  checkedAt = ref(null),
  loading = ref(false),
  now = ref(Date.now());
const focusedRecord = ref(null),
  showSettings = ref(false),
  showAbout = ref(false),
  showForecast = ref(false),
  showForecastHistory = ref(false),
  message = ref("");
const serverStatus=ref(null),subscription=ref(null),deliveries=ref([]),authorizing=ref(false),forecastHistory=ref([]);
const webArmed=ref(false),webNotices=ref([]);
let systemNotificationsAvailable=false;
// #ifdef H5
let webMonitor=createWebMonitor();
systemNotificationsAvailable=typeof window!=='undefined'&&canUsePageNotifications({secure:window.isSecureContext,notification:window.Notification,userAgent:navigator.userAgent,platform:navigator.platform,maxTouchPoints:navigator.maxTouchPoints});
const clientTranslator=createClientTranslator({load:()=>uni.getStorageSync('pulse:translations:zh:v1')||{},save:cache=>uni.setStorageSync('pulse:translations:zh:v1',cache)});
// #endif
let entry={},visible=true,hydrating=false;
const navItems = [
  { key: "radar", icon: "radar" },
  { key: "history", icon: "history" },
  { key: "alerts", icon: "bell" },
];
const zones = [
  { value: "Europe/London", key: "london" },
  { value: "Asia/Shanghai", key: "shanghai" },
  { value: "UTC", key: "utc" },
];
const t = (key) => messages[settings.language][key] || key;
const zoneName = computed(() =>
  t(zones.find((zone) => zone.value === settings.zone)?.key || "utc"),
);
const records = computed(() => feed.value.records);
const signals = computed(() => feed.value.signals || []);
const latest = computed(() => records.value[0]);
const forecast = computed(() =>
  ["cached","stale","unavailable"].includes(mode.value)
    ? null
    : getForecast(feed.value.forecast, now.value),
);
const rhythm = computed(() => getRhythm(records.value));
const maxInterval = computed(() => Math.max(1, ...rhythm.value.intervals));
const automaticCount = computed(
  () => records.value.filter((record) => record.type === "automatic").length,
);
const filteredRecords = computed(() =>
  filterRecords([...records.value,...signals.value].sort((a,b)=>Date.parse(b.postedAt)-Date.parse(a.postedAt)), filter.value, query.value, settings.zone),
);
const time = (value) => formatTime(value, settings.language, settings.zone);
const sourceIsFresh = source => source.status==='ok'&&Date.parse(source.lastSuccessAt)<=now.value+60000&&now.value-Date.parse(source.lastSuccessAt)<1800000;
const excerpt = (record) => displayText(record,settings.language);
let sequence = 0,
  tick, autoRefresh, preferenceSync;

async function refresh() {
  const current = ++sequence;
  loading.value = true;
  if (settings.demo) {
    feed.value = normalizeFeed(createDemo());
    mode.value = "demo";
    checkedAt.value = new Date().toISOString();
    loading.value = false;
    return;
  }
  const result = await fetchFeed();
  if (current !== sequence) return;
  feed.value = result.feed;
  mode.value = result.mode;
  checkedAt.value = result.checkedAt;
  loading.value = false;
  // #ifdef H5
  clientTranslator.apply(feed.value,settings.language);
  if(webArmed.value)checkWebNotices();
  // #endif
  if(entry.record){const r=[...records.value,...signals.value,...(feed.value.posts||[])].find(r=>r.id===entry.record);if(r){openDetail(r);entry={};}}
  if(entry.forecast){showForecast.value=Boolean(forecast.value);entry={};}
}
function navigate(value) {
  tab.value = value;
  if(value==='alerts')loadSubscription();
  uni.pageScrollTo({ scrollTop: 0, duration: 0 });
}
function toggleLanguage() {
  settings.language = settings.language === "zh" ? "en" : "zh";
}
function cycleZone() {
  settings.zone =
    zones[
      (zones.findIndex((zone) => zone.value === settings.zone) + 1) %
        zones.length
    ].value;
}
function openDetail(record) {
  focusedRecord.value = record;
  // #ifdef H5
  return clientTranslator.apply({records:[record]},settings.language);
  // #endif
}
function closeModal() {
  focusedRecord.value = null;
  showSettings.value = false;
  showAbout.value = false;
  showForecast.value = false;
  showForecastHistory.value = false;
  message.value = "";
}
function showMessage(key) {
  closeModal();
  message.value = key;
}
function copySource(url) {
  if (mode.value === "demo") return showMessage("demoSource");
  uni.setClipboardData({
    data: url,
    success: () => uni.showToast({ title: t("copied"), icon: "none" }),
  });
}
function openSource(url) {
  if (mode.value === "demo") return showMessage("demoSource");
  // #ifdef H5
  window.open(url, "_blank", "noopener,noreferrer");
  // #endif
  // #ifndef H5
  copySource(url);
  // #endif
}
async function loadService(){try{serverStatus.value=await api('/status');}catch{serverStatus.value=null;}}
async function loadSubscription(){
  // #ifdef H5
  await loadService();return;
  // #endif
  const before=JSON.stringify(settings);
  await loadService();
  if(!hasSession())return;
  try{const [s,d]=await Promise.all([api('/subscriptions','GET',undefined,true),api('/deliveries','GET',undefined,true)]);subscription.value=s.subscription;deliveries.value=d.deliveries;
    if(s.subscription&&JSON.stringify(settings)===before){hydrating=true;for(const key of ['resetAlerts','forecastAlerts','threshold','language','zone'])settings[key]=s.subscription[key];await nextTick();hydrating=false;}
  }catch{subscription.value=null;hydrating=false;}
}
async function openForecastHistory(){
  if(mode.value==='demo')return showMessage('demoSource');
  try{const result=await api('/forecasts');forecastHistory.value=result.forecasts;showForecastHistory.value=true;
   // #ifdef H5
   clientTranslator.apply({forecasts:forecastHistory.value},settings.language);
   // #endif
  }catch{showMessage('historyFailed');}
}
async function removeSubscription(){
  // #ifdef H5
  return showMessage('browserOnly');
  // #endif
  // #ifdef MP-WEIXIN
  try{await login();await api('/subscriptions','DELETE',undefined,true);clearSession();subscription.value=null;deliveries.value=[];settings.resetAlerts=false;settings.forecastAlerts=false;showMessage('subscriptionDeleted');}catch{showMessage('saveFailed');}
  // #endif
}
async function manageSubscription(){
  // #ifdef H5
  return showMessage('browserOnly');
  // #endif
  // #ifdef MP-WEIXIN
  try{await login();await loadSubscription();}catch{showMessage('authFailed');}
  // #endif
}
function toggleWebMonitor(){
 // #ifdef H5
 if(webArmed.value){webArmed.value=false;return;}
 if(settings.demo)return showMessage('demoSource');
 if(!settings.resetAlerts&&!settings.forecastAlerts)return showMessage('chooseAlert');
 webArmed.value=true;
 webMonitor=createWebMonitor();
 webMonitor.check(feed.value,settings,mode.value);
 // #endif
}
async function allowBrowserNotifications(){
 // #ifdef H5
 if(!systemNotificationsAvailable)return showMessage('browserNotificationUnavailable');
 try{const permission=await Notification.requestPermission();showMessage(permission==='granted'?'browserNotificationGranted':'browserNotificationDenied');}catch{showMessage('browserNotificationUnavailable');}
 // #endif
}
function openWebNotice(notice){
 closeModal();
 if(notice.kind==='reset')openDetail(notice.record);
 else {forecastHistory.value=[{...notice.forecast,savedAt:notice.at}];showForecastHistory.value=true;}
}
function checkWebNotices(){
 // #ifdef H5
 const notices=webMonitor.check(feed.value,settings,mode.value);
 for(const notice of notices){
  webNotices.value.unshift({...notice,at:new Date().toISOString()});
  const title=t(notice.kind==='reset'?'resetAlerts':'forecastAlerts');
  uni.showToast({title,icon:'none',duration:4000});
  if(systemNotificationsAvailable&&Notification.permission==='granted'){
   try{const n=new Notification(t('siteName')+' · '+title,{body:notice.kind==='reset'?displayText(notice.record,settings.language).slice(0,140):notice.forecast.probability+'% · '+(settings.language==='zh'?'来源预测达到提醒阈值':notice.forecast.windowText),icon:'/static/pulse.png',tag:notice.key});n.onclick=()=>{window.focus();openWebNotice(notice);n.close();};}catch{}
  }
 }
 webNotices.value=webNotices.value.slice(0,30);
 // #endif
}
function authorize() {
  if(settings.demo)return showMessage('demoSource');
  if (!settings.resetAlerts && !settings.forecastAlerts)
    return showMessage("chooseAlert");
  // #ifdef H5
  return showMessage("browserOnly");
  // #endif
  // #ifdef MP-WEIXIN
  const templates=serverStatus.value?.wechat?.templateIds||{};
  const ids = [];
  if (settings.resetAlerts) ids.push(templates.reset);
  if (settings.forecastAlerts) ids.push(templates.forecast);
  if (!serverStatus.value?.wechat?.configured || ids.some((id) => !id))
    return showMessage("noTemplate");
  if(authorizing.value)return;
  authorizing.value=true;
  const requestId='consent_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
  // Keep this API call directly in the tap handler, before any asynchronous login.
  uni.requestSubscribeMessage({
    tmplIds: ids,
    success: async(result) => {
      const outcome=subscriptionOutcome(result,ids);
      if(outcome==='denied'){authorizing.value=false;return showMessage('denied');}
      try{
        await login();
        const preferences={...settings};
        const response=await api('/subscriptions','POST',{settings:preferences,requestId,grants:{reset:result[templates.reset]==='accept',forecast:result[templates.forecast]==='accept'}},true);
        subscription.value=response.subscription;
        if(JSON.stringify(preferences)!==JSON.stringify({...settings})){
          const synced=await api('/subscriptions','PUT',{settings:{...settings}},true);subscription.value=synced.subscription;
        }
        showMessage(outcome);
      }catch{showMessage('saveFailed');}finally{authorizing.value=false;}
    },
    fail: () => {authorizing.value=false;showMessage("authFailed");},
  });
  // #endif
}
watch(
  settings,
  () => {
    try {
      uni.setStorageSync("pulse:settings", { ...settings });
    } catch {}
    clearTimeout(preferenceSync);
    if(!hydrating && hasSession() && subscription.value && !settings.demo){
      preferenceSync=setTimeout(async()=>{try{const result=await api('/subscriptions','PUT',{settings:{...settings}},true);subscription.value=result.subscription;}catch{showMessage('syncFailed');}},600);
    }
  },
  { deep: true },
);
watch(
  () => settings.demo,
  () => {
    focusedRecord.value = null;
    showForecast.value = false;
    showForecastHistory.value = false;
    webArmed.value = false;
    webNotices.value = [];
    refresh();
  },
);
watch(
  () => settings.language,
  (language) => {
    // #ifdef H5
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title = language === "zh" ? "Codex 回响 · 重置公告与 Bark 提醒" : "Codex Echo · Reset Radar & Bark Alerts";
    clientTranslator.apply(feed.value,language);
    // #endif
  },
  { immediate: true },
);
onMounted(() => {
  refresh();
  loadSubscription();
  tick = setInterval(() => (now.value = Date.now()), 1000);
  autoRefresh=setInterval(()=>{if(visible&&!settings.demo&&!loading.value)refresh();},120000);
});
onLoad(options=>{entry=options||{};});
onShow(()=>{visible=true;now.value=Date.now();if(!loading.value)refresh();});
onHide(()=>{visible=false;});
onUnmounted(() => {clearInterval(tick);clearInterval(autoRefresh);clearTimeout(preferenceSync);});
</script>
