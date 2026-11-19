#!/usr/bin/env python3
"""مقارنة «تربح» القديم (الحي على Hostinger) بالجديد (على هذا الخادم) قبل تغيير DNS. قراءة فقط.

لكل إعلان في قاعدة الخادم الجديد:
  - صفحته تفتح في القديم والجديد، والعنوان نفسه.
  - كل صورة وفيديو تابع له (من قاعدة البيانات) مذكور في صفحته الجديدة.
  - كل ملف منها يُخدَّم من الجديد (من R2) بالحجم نفسه الذي يخدّمه القديم.
يطبع ملخصاً وينتهي بـ COMPARE_OK أو COMPARE_DIFF مع أول الفروقات.
"""
import concurrent.futures as cf, hashlib, os, re, subprocess, sys, urllib.parse, urllib.request, urllib.error

OLD = os.environ.get('TRBHH_OLD_BASE', 'https://trbhh.sa')
NEW = os.environ.get('TRBHH_NEW_BASE', 'http://127.0.0.1:8101')
NEW_HEADERS = {'Host': 'trbhh.sa', 'X-Forwarded-Proto': 'https'}
UA = {'User-Agent': 'trbhh-migration-compare'}


def db_env():
    env = {}
    for line in open('/etc/trbhh/db.env', encoding='utf-8'):
        if '=' in line:
            k, v = line.rstrip('\n').split('=', 1); env[k] = v
    return env


def sql(query):
    e = db_env()
    out = subprocess.run(['docker', 'exec', '-e', 'MYSQL_PWD=' + e['MYSQL_ROOT_PASSWORD'], 'trbhh-db', 'mysql', '-uroot',
                          '--default-character-set=utf8mb4', '-N', '-B', e['MYSQL_DATABASE'], '-e', query],
                         capture_output=True, text=True, check=True).stdout
    return [line.split('\t') for line in out.splitlines() if line]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


opener = urllib.request.build_opener(NoRedirect)


def fetch(base, path, extra=None, body=True):
    headers = dict(UA); headers.update(NEW_HEADERS if base == NEW else {}); headers.update(extra or {})
    req = urllib.request.Request(base + path, headers=headers)
    try:
        with opener.open(req, timeout=45) as r:
            return r.status, dict(r.headers), (r.read() if body else b'')
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), b''
    except Exception as e:  # noqa: BLE001 — يُسجَّل كفرق لا كتعطل
        return 0, {'error': str(e)[:80]}, b''


VIDEO_EXT = {'mp4', 'mov', 'm4v', 'webm', 'mkv', '3gp'}


def total_size(base, rel):
    """(الحالة، الحجم، البصمة) للملف كما يخدّمه الموقع. الصور تُنزَّل كاملة وتُقارن ببصمتها؛
    الفيديو يُقارن بحجمه الكلي من Content-Range (بايت واحد) لتفادي تنزيل ملفات كبيرة."""
    path = '/media/' + urllib.parse.quote(rel)
    if rel.rsplit('.', 1)[-1].lower() in VIDEO_EXT:
        status, headers, _ = fetch(base, path, {'Range': 'bytes=0-0'})
        m = re.search(r'/(\d+)$', headers.get('Content-Range') or headers.get('content-range') or '')
        if m: return status, int(m.group(1)), ''
    status, _, body = fetch(base, path)
    return status, len(body), hashlib.sha256(body).hexdigest()[:16]


def title_of(html):
    m = re.search(rb'<title[^>]*>(.*?)</title>', html, re.S)
    return re.sub(r'\s+', ' ', m.group(1).decode('utf-8', 'replace')).strip() if m else ''


def main():
    ads = [r[0] for r in sql('SELECT id FROM ads ORDER BY id')]
    media = {}
    for ad, f in sql("SELECT ph.other_id, u.file_name FROM photos ph JOIN ads a ON a.id=ph.other_id JOIN uploads u ON u.id=CAST(ph.photo_path AS UNSIGNED) WHERE u.file_name<>''"):
        media.setdefault(ad, set()).add(f.lstrip('/'))
    for ad, f in sql("SELECT id, video_path FROM ads WHERE video_path LIKE '%/%'"):
        media.setdefault(ad, set()).add(f.lstrip('/'))
    for ad, f in sql("SELECT a.id, u.file_name FROM ads a JOIN uploads u ON u.id=CAST(a.video_path AS UNSIGNED) WHERE a.video_path REGEXP '^[0-9]+$' AND a.video_path<>'0' AND u.file_name<>''"):
        media.setdefault(ad, set()).add(f.lstrip('/'))
    published = {r[0] for r in sql('SELECT id FROM ads WHERE status=1')}
    diffs, no_images = [], []

    def check_ad(ad):
        out = []
        so, _, ho = fetch(OLD, '/ads/' + ad)
        sn, _, hn = fetch(NEW, '/ads/' + ad)
        if so != sn: out.append(f'ad {ad}: page status old={so} new={sn}')
        if so == 200 and sn == 200 and title_of(ho) != title_of(hn): out.append(f'ad {ad}: title differs')
        text = urllib.parse.unquote(hn.decode('utf-8', 'replace'))
        if sn == 200 and ad in published:
            for f in media.get(ad, ()):
                if f not in text: out.append(f'ad {ad}: media not shown on new page: {f}')
        return out

    def check_file(f):
        so, zo, ho = total_size(OLD, f); sn, zn, hn = total_size(NEW, f)
        if sn not in (200, 206): return f'media {f}: new status={sn} (old={so})'
        if so not in (200, 206): return f'media {f}: old status={so} but new serves it'
        if zo != zn or ho != hn: return f'media {f}: differs old={zo}/{ho} new={zn}/{hn}'
        return None

    with cf.ThreadPoolExecutor(6) as ex:
        for res in ex.map(check_ad, ads): diffs += res
        files = sorted({f for s in media.values() for f in s})
        for res in ex.map(check_file, files):
            if res: diffs.append(res)
    no_images = [ad for ad in ads if ad in published and not media.get(ad)]
    for path in ('/', '/search', '/login'):
        so, _, _ = fetch(OLD, path, body=False); sn, _, _ = fetch(NEW, path, body=False)
        if so != sn: diffs.append(f'page {path}: status old={so} new={sn}')

    print(f'ads_compared={len(ads)} published={len(published)} ads_with_media={len(media)} media_files={len(files)} published_ads_without_any_media_in_db={len(no_images)}')
    if no_images: print('ads with no image/video rows at all (text-only in the old site too): ' + ','.join(no_images[:40]))
    if diffs:
        print(f'differences={len(diffs)}')
        for d in diffs[:40]: print('  ' + d)
        print('COMPARE_DIFF'); sys.exit(1)
    print('differences=0'); print('COMPARE_OK')


if __name__ == '__main__':
    main()
