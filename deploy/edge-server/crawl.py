#!/usr/bin/env python3
"""فحص الروابط المكسورة في «تربح» على الخادم الجديد قبل DNS (قراءة فقط).

يبدأ من الصفحة الرئيسية والبحث وخريطة الموقع، ويتتبّع الروابط الداخلية حتى حدّ أقصى من الصفحات،
ويفحص كل صورة وفيديو مذكور فيها. يطبع كل رابط مكسور مع الصفحة التي ورد فيها، وينتهي بـ
CRAWL_OK أو CRAWL_BROKEN. يتصل بـ127.0.0.1:8101 مباشرة (TRBHH_BASE لتغيير الهدف).
"""
import collections, concurrent.futures as cf, html, os, re, sys, time, urllib.error, urllib.parse, urllib.request

BASE = os.environ.get('TRBHH_BASE', 'http://127.0.0.1:8101')
MAX_PAGES = int(os.environ.get('TRBHH_CRAWL_PAGES', '400'))
HEADERS = {'User-Agent': 'trbhh-migration-crawl'}
if BASE.startswith('http://127.'): HEADERS.update({'Host': 'trbhh.sa', 'X-Forwarded-Proto': 'https'})
SKIP = re.compile(r'^/(logout|api/|_next/static|admin|account|store(/|$)|messages|notifications|login\?|register\?|r/|payment|pay)')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None


opener = urllib.request.build_opener(NoRedirect)


def fetch(path, body=True):
    last = (0, {}, b'')
    for attempt in range(3):
        try:
            with opener.open(urllib.request.Request(BASE + path, headers=HEADERS), timeout=45) as r:
                return r.status, dict(r.headers), (r.read() if body else r.read(1))
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers or {}), b''
        except Exception as e:  # noqa: BLE001
            last = (0, {'error': str(e)[:80]}, b''); time.sleep(1 + attempt * 2)
    return last


def page(path):
    """حالة الصفحة كما يراها الزائر، مع اتباع التحويل وعدّ صفحة «غير موجود» 404."""
    status, headers, body = fetch(path)
    for _ in range(3):
        loc = headers.get('Location') or headers.get('location')
        m = re.search(rb'NEXT_REDIRECT;(?:replace|push);([^;"\\]+);', body)
        target = loc or (m.group(1).decode('utf-8', 'replace') if m else None)
        if not target: break
        if target.startswith('http'):
            u = urllib.parse.urlsplit(target)
            if u.hostname not in ('trbhh.sa', 'www.trbhh.sa', '127.0.0.1', 'localhost'): return 200, b''  # خارجي
            target = u.path + ('?' + u.query if u.query else '')
        status, headers, body = fetch(urllib.parse.quote(target, safe='/?=&%:@+,'))
    m = re.search(rb'NEXT_HTTP_ERROR_FALLBACK;(\d{3})', body)
    if m: status = int(m.group(1))
    return status, body


def links_and_media(body):
    text = body.decode('utf-8', 'replace')
    hrefs = {html.unescape(h) for h in re.findall(r'<a\b[^>]*\bhref="(/[^"#]*)', text)}
    media = set()
    def add_media(u):
        if u.startswith('/_next/image?'):
            q = urllib.parse.parse_qs(urllib.parse.urlsplit(u).query).get('url', [''])[0]
            if q.startswith('/media/'): media.add(q)
        elif u.startswith('/media/') and not re.search(r'\.woff2?$', u): media.add(u)
    # src/poster: القيمة كاملة رابط واحد (قد يحوي اسم الملف مسافات أو فواصل).
    for src in re.findall(r'(?:src|poster)="([^"]+)"', text): add_media(html.unescape(src).strip())
    # srcSet: قائمة «رابط عرض» مفصولة بفواصل؛ روابط next/image فيها مرمّزة فلا فواصل داخلها.
    for srcset in re.findall(r'srcSet="([^"]+)"', text):
        for part in html.unescape(srcset).split(', '):
            add_media(part.strip().rsplit(' ', 1)[0])
    return {h for h in hrefs if not h.startswith('//') and not SKIP.match(h)}, media


def main():
    found_on = {}
    queue = collections.deque()
    def add(path, src):
        if path not in found_on: found_on[path] = src; queue.append(path)
    for start in ('/', '/search', '/classified', '/companies', '/guide', '/packages'): add(start, '(start)')
    s, _, sm = fetch('/sitemap.xml')
    if s == 200:
        for loc in re.findall(rb'<loc>([^<]+)</loc>', sm)[:2000]:
            u = urllib.parse.urlsplit(html.unescape(loc.decode('utf-8', 'replace')))
            add(u.path + ('?' + u.query if u.query else ''), 'sitemap.xml')
    broken, media_src, checked = [], {}, 0
    with cf.ThreadPoolExecutor(6) as ex:
        while queue and checked < MAX_PAGES:
            batch = [queue.popleft() for _ in range(min(12, len(queue), MAX_PAGES - checked))]
            for path, (status, body) in zip(batch, ex.map(lambda p: page(urllib.parse.quote(p, safe='/?=&%:@+,')), batch)):
                checked += 1
                if status != 200: broken.append(f'page {status}: {path}   (found on {found_on[path]})'); continue
                hrefs, media = links_and_media(body)
                for h in sorted(hrefs): add(h, path)
                for m in media: media_src.setdefault(m, path)
        def check_media(m):
            status, _, _ = fetch(urllib.parse.quote(urllib.parse.unquote(m), safe='/'), body=False)
            return None if status in (200, 206) else f'media {status}: {m}   (found on {media_src[m]})'
        for res in ex.map(check_media, sorted(media_src)):
            if res: broken.append(res)
    print(f'pages_checked={checked} links_found={len(found_on)} not_crawled={len(queue)} media_checked={len(media_src)} broken={len(broken)}')
    for b in broken[:60]: print('  ' + b)
    print('CRAWL_BROKEN' if broken else 'CRAWL_OK'); sys.exit(1 if broken else 0)


if __name__ == '__main__':
    main()
