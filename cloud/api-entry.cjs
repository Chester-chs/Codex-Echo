const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV, throwOnNotFound: false });
exports.main = async (event) => {
  try {
    const identity = cloud.getWXContext();
    if (!process.env.WECHAT_APP_ID || identity.APPID !== process.env.WECHAT_APP_ID || !['wx_client', 'wx_devtools'].includes(identity.SOURCE)) {
      return { statusCode: 401, data: { error: 'WeChat client identity required' } };
    }
    const [{repository}, {handleApi}, {validateTemplates}] = await Promise.all([
      import('./cloud/database.mjs'), import('./cloud/api.mjs'), import('./backend/wechat.mjs'),
    ]);
    const templates = validateTemplates(JSON.parse(process.env.WECHAT_TEMPLATES_JSON || '{}'));
    return await handleApi({ repo: repository(cloud.database()), identity, templates, event });
  } finally {
    // Do not retain the previous caller's identity if this instance later receives a non-WeChat invocation.
    for (const key of (process.env.WX_CONTEXT_KEYS || '').split(',')) if (key.startsWith('WX_')) delete process.env[key];
    delete process.env.WX_CONTEXT_KEYS;
    delete process.env.TCB_SOURCE;
  }
};
