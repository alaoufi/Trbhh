// يطبع مسارات وسائط الإعلانات الأقدم من DAYS يوماً (صور وفيديو) التي لا يستخدمها أي إعلان أحدث.
// قراءة فقط من قاعدة البيانات. إعلان بلا تاريخ إنشاء يُعامل كحديث (تُنقل وسائطه) احتياطاً.
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const days = Math.max(1, Math.floor(Number(process.env.DAYS || 90)));
  const ads = await p.$queryRawUnsafe(`SELECT id, video_path, (created_at < NOW() - INTERVAL ${days} DAY) AS old FROM ads`);
  const photos = await p.$queryRawUnsafe('SELECT ph.other_id AS ad, u.file_name AS f FROM photos ph JOIN uploads u ON u.id = CAST(ph.photo_path AS UNSIGNED)');
  const isOld = new Map(ads.map((a) => [String(a.id), Number(a.old) === 1]));
  const oldFiles = new Set(), keepFiles = new Set();
  const add = (adId, f) => { if (!f) return; const rel = String(f).replace(/^\/+/, ''); if (!rel || /[\r\n]/.test(rel)) return; (isOld.get(String(adId)) ? oldFiles : keepFiles).add(rel); };
  for (const r of photos) add(r.ad, r.f);
  const ids = ads.filter((a) => /^\d+$/.test(a.video_path || '') && Number(a.video_path) > 0).map((a) => Number(a.video_path));
  const vids = ids.length ? await p.$queryRawUnsafe(`SELECT id, file_name FROM uploads WHERE id IN (${ids.join(',')})`) : [];
  const vidById = new Map(vids.map((v) => [String(v.id), v.file_name]));
  for (const a of ads) { const v = a.video_path || ''; add(a.id, /^\d+$/.test(v) ? vidById.get(v) : v); }
  let n = 0;
  for (const f of oldFiles) if (!keepFiles.has(f)) { process.stdout.write(f + '\n'); n++; }
  const oldAds = [...isOld.values()].filter(Boolean).length;
  process.stderr.write(`ads_total=${ads.length} ads_older_than_${days}d=${oldAds} ads_recent=${ads.length - oldAds} old_media_skipped=${n} recent_media_files=${keepFiles.size}\n`);
  process.exit(0);
})().catch((e) => { process.stderr.write('ERROR ' + e.message + '\n'); process.exit(1); });
