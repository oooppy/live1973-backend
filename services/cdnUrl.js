// services/cdnUrl.js
// 阿里云 CDN URL 鉴权（Type A 时间戳防盗链）与 CDN URL 生成工具
require('dotenv').config();

const crypto = require('crypto');

function getEnvBoolean(name, defaultValue = false) {
  const v = process.env[name];
  if (v === undefined) return defaultValue;
  return v === 'true' || v === '1';
}

const config = {
  enabled: getEnvBoolean('CDN_ENABLED', false),
  domain: process.env.CDN_DOMAIN || 'vod.live1973.cn',
  authEnabled: getEnvBoolean('CDN_AUTH_ENABLED', false),
  expireSeconds: parseInt(process.env.CDN_EXPIRE_SECONDS || '1800', 10),
  primaryKey: process.env.CDN_AUTH_KEY_PRIMARY || '',
  backupKey: process.env.CDN_AUTH_KEY_BACKUP || ''
};

function normalizePath(pathOrUrl) {
  try {
    if (!pathOrUrl) return '';
    // 如果是完整 URL，取 pathname
    if (/^https?:\/\//i.test(pathOrUrl)) {
      const u = new URL(pathOrUrl);
      return u.pathname.startsWith('/') ? u.pathname : '/' + u.pathname;
    }
    // 否则视为相对路径
    return pathOrUrl.startsWith('/') ? pathOrUrl : '/' + pathOrUrl;
  } catch (_) {
    return '';
  }
}

function buildCdnUrlFromPath(objectPath) {
  const path = normalizePath(objectPath);
  if (!path) return '';
  const scheme = 'http'; // 使用 HTTP 协议，避免 HTTPS 证书问题
  return `${scheme}://${config.domain}${path}`;
}

// Type A: auth_key=ts-rand-uid-sign
function buildAuthKey(pathname, key, expireTs, rand = '0', uid = '0') {
  const src = `${pathname}-${expireTs}-${rand}-${uid}-${key}`;
  const sign = crypto.createHash('md5').update(src).digest('hex');
  return `${expireTs}-${rand}-${uid}-${sign}`;
}

function signCdnUrl(url, useBackup = false) {
  try {
    if (!config.authEnabled) return url;
    const key = useBackup ? config.backupKey : config.primaryKey;
    if (!key) return url;

    const u = new URL(url);
    const now = Math.floor(Date.now() / 1000);
    const expireTs = now + (config.expireSeconds || 1800);
    const rand = '0';
    const uid = '0';
    const authKey = buildAuthKey(u.pathname, key, expireTs, rand, uid);
    u.searchParams.set('auth_key', authKey);
    return u.toString();
  } catch (_) {
    return url;
  }
}

function toCdnSignedUrlFromOrigin(originUrlOrPath) {
  if (!config.enabled) return originUrlOrPath || '';
  const path = normalizePath(originUrlOrPath);
  if (!path) return originUrlOrPath || '';
  let cdn = buildCdnUrlFromPath(path);
  let signed = signCdnUrl(cdn, false);
  // 若主 key 失败（极少数边缘情况），尝试备 key
  if (signed === cdn && config.authEnabled && config.backupKey) {
    signed = signCdnUrl(cdn, true);
  }
  return signed;
}

function generateSignedUrlForPath(objectPath) {
  if (!config.enabled) return '';
  const base = buildCdnUrlFromPath(objectPath);
  if (!base) return '';
  return signCdnUrl(base, false);
}

module.exports = {
  config,
  normalizePath,
  buildCdnUrlFromPath,
  signCdnUrl,
  toCdnSignedUrlFromOrigin,
  generateSignedUrlForPath
};


