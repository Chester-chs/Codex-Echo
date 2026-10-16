import { config } from "../config";
import { createFeedLoader } from "./feed-store.mjs";
import { api } from './api';

export const fetchFeed = createFeedLoader({
  url: config.cloudEnv ? 'cloud:'+config.cloudEnv : config.feedUrl,
  request: (url) =>
    config.cloudEnv ? api('/feed').then(data=>({statusCode:200,data})) : new Promise((resolve, reject) =>
      url ? uni.request({ url, timeout: 12000, success: resolve, fail: reject }) : reject(new Error('API not configured')),
    ),
  storage: {
    get: (key) => uni.getStorageSync(key),
    set: (key, value) => uni.setStorageSync(key, value),
  },
});
