let apiBase = import.meta.env.VITE_RADAR_API_BASE || '/api';
let cloudEnv = '';
// #ifdef MP-WEIXIN
apiBase = import.meta.env.VITE_RADAR_API_BASE || '';
cloudEnv = import.meta.env.VITE_WECHAT_CLOUD_ENV || '';
// #endif
export const config = {
  cloudEnv,
  cloudFunction: 'pulseApi',
  apiBase: apiBase.replace(/\/$/,''),
  feedUrl:
    import.meta.env.VITE_RADAR_FEED_URL || (apiBase ? apiBase.replace(/\/$/,'')+'/feed' : ''),
  sourceName: import.meta.env.VITE_RADAR_SOURCE_NAME || "AIPlanWatch · X · tokenusage",
};
