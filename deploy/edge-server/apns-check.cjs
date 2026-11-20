// فحص مفتاح إشعارات iPhone من داخل حاوية التطبيق (قراءة فقط، لا يطبع المفتاح):
// يوقّع رمز دخول ويسأل Apple برمز جهاز وهمي. الرد 400 BadDeviceToken يعني أن Apple قبلت المفتاح.
const { createPrivateKey, sign } = require('node:crypto');
const http2 = require('node:http2');
const e = process.env;
const missing = ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_BUNDLE_ID', 'APNS_KEY'].filter((k) => !e[k]);
if (missing.length) { console.log('APNS_FAIL missing=' + missing.join(',')); process.exit(1); }
let key;
try {
  let pem = e.APNS_KEY.trim();
  if (!pem.includes('BEGIN')) pem = Buffer.from(pem, 'base64').toString('utf8');
  key = createPrivateKey(pem.replace(/\\n/g, '\n'));
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails.namedCurve !== 'prime256v1') throw new Error('curve');
} catch { console.log('APNS_FAIL المفتاح ليس مفتاح P-256 صالحاً'); process.exit(1); }
const b = (v) => Buffer.from(v).toString('base64url');
const head = b(JSON.stringify({ alg: 'ES256', kid: e.APNS_KEY_ID }));
const claims = b(JSON.stringify({ iss: e.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }));
const jwt = `${head}.${claims}.${b(sign('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' }))}`;
const client = http2.connect('https://api.push.apple.com');
const fail = (m) => { console.log('APNS_FAIL ' + m); try { client.destroy(); } catch {} process.exit(1); };
const timer = setTimeout(() => fail('لا رد من Apple خلال 15 ثانية'), 15000);
client.on('error', () => fail('تعذر الاتصال بـ api.push.apple.com'));
const body = JSON.stringify({ aps: { alert: 'check' } });
const req = client.request({ ':method': 'POST', ':path': '/3/device/' + '0'.repeat(64), authorization: 'bearer ' + jwt, 'apns-topic': e.APNS_BUNDLE_ID, 'apns-push-type': 'alert', 'content-type': 'application/json' });
let status = 0, text = '';
req.setEncoding('utf8');
req.on('response', (h) => { status = h[':status']; });
req.on('data', (c) => { text += c; });
req.on('end', () => {
  clearTimeout(timer); client.close();
  let reason = ''; try { reason = JSON.parse(text).reason || ''; } catch {}
  if (status === 400 && reason === 'BadDeviceToken') { console.log(`APNS_OK key_id=${e.APNS_KEY_ID} team=${e.APNS_TEAM_ID} bundle=${e.APNS_BUNDLE_ID}`); process.exit(0); }
  console.log(`APNS_FAIL apple_status=${status} reason=${reason || '-'}`); process.exit(1);
});
req.on('error', () => fail('انقطع الطلب'));
req.end(body);
