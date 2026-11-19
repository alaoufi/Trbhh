// Google Play Developer API without libraries: a service-account token (RS256 JWT) and
// the "edit" calls. The key comes from PLAY_SERVICE_ACCOUNT_JSON (a GitHub secret) and is never
// printed. Used by check.cjs now; the upload of a new version will reuse it.
const crypto = require('crypto');

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const b64url = value => Buffer.from(value).toString('base64url');

function serviceAccount() {
  const raw = process.env.PLAY_SERVICE_ACCOUNT_JSON || '';
  if (!raw.trim()) throw new Error('PLAY_SERVICE_ACCOUNT_JSON is empty: add the key as a GitHub secret');
  let key;
  try { key = JSON.parse(raw); } catch (_) { throw new Error('PLAY_SERVICE_ACCOUNT_JSON is not the JSON key file (paste the whole file)'); }
  if (key.type !== 'service_account' || !key.client_email || !key.private_key) throw new Error('PLAY_SERVICE_ACCOUNT_JSON is not a service-account key');
  return key;
}

async function accessToken(key = serviceAccount()) {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = key.token_uri || 'https://oauth2.googleapis.com/token';
  const body = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: key.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: tokenUri, iat: now, exp: now + 3600,
  }))}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(body), key.private_key).toString('base64url');
  const res = await fetch(tokenUri, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${body}.${signature}` }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Google refused the key (${res.status} ${data.error || ''} ${data.error_description || ''})`.trim());
  return { token: data.access_token, email: key.client_email };
}

async function call(token, method, url, body) {
  const res = await fetch(url, {
    method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const message = data?.error?.message || data?.raw || res.statusText;
    const error = new Error(`${method} ${url.replace(API, '')}: ${res.status} ${message}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

// Opens an edit, runs fn(edit), and deletes the edit unless fn asks to commit it.
async function withEdit(token, packageName, fn) {
  const base = `${API}/${packageName}/edits`;
  const edit = await call(token, 'POST', base);
  const editUrl = `${base}/${edit.id}`;
  let commit = false;
  try {
    commit = Boolean(await fn({ id: edit.id, url: editUrl, call: (method, path, body) => call(token, method, `${editUrl}${path}`, body) }));
    if (commit) return await call(token, 'POST', `${editUrl}:commit`);
    return null;
  } finally {
    if (!commit) await call(token, 'DELETE', editUrl).catch(() => {});
  }
}

module.exports = { API, accessToken, call, withEdit, serviceAccount };
