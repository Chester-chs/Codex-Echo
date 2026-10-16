const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV, throwOnNotFound: false });
exports.main = async (event) => {
  const {authorizedSync, synchronize} = await import('./cloud/sync.mjs');
  if (!authorizedSync(event, process.env.RADAR_SCHEDULER_SECRET)) return { error: 'Unauthorized scheduler' };
  if (!/^wx[a-f0-9]{16}$/i.test(process.env.WECHAT_APP_ID || '')) return { error: 'AppID not configured' };
  const [{repository}, {cloudGateway}, {validateTemplates}] = await Promise.all([
    import('./cloud/database.mjs'), import('./cloud/gateway.mjs'), import('./backend/wechat.mjs'),
  ]);
  const templates = validateTemplates(JSON.parse(process.env.WECHAT_TEMPLATES_JSON || '{}'));
  return synchronize({ repo: repository(cloud.database()), gateway: cloudGateway(cloud, templates, process.env.WECHAT_MESSAGE_STATE || 'trial', process.env.WECHAT_APP_ID) });
};
