#!/usr/bin/env python3
"""مولّد التقرير الأمني لكل إصدار + بوابة CI.

يقرأ ناتج Semgrep (JSON) وناتج ZAP (traditional-json) ويُخرج:
  security/reports/<التاريخ>-<sha7>.json  ملخص آلي بلا شيفرة ولا أسرار (قاعدة، مسار، عدد، تصنيف)
  security/reports/<التاريخ>-<sha7>.md    تقرير مقروء مع مقارنة الإصدار السابق
مع --gate يخرج بالرمز 1 إذا وُجدت نتيجة حرجة/عالية غير مفروزة كـ false-positive أو accepted.

لا يُكتب في التقرير أي سطر شيفرة أو قيمة: فقط معرّف القاعدة والمسار وعدد المواضع.
"""
import argparse, datetime, fnmatch, glob, json, os, sys

ORDER = ['critical', 'high', 'medium', 'low', 'info']
AR = {'critical': 'حرجة', 'high': 'عالية', 'medium': 'متوسطة', 'low': 'منخفضة', 'info': 'معلوماتية'}
STATUS_AR = {'open': 'مفتوحة', 'confirmed': 'مؤكدة', 'accepted': 'مقبولة بمبرر', 'false-positive': 'إنذار كاذب'}


def semgrep_findings(path):
    data = json.load(open(path, encoding='utf-8'))
    grouped = {}
    for r in data.get('results', []):
        rule = r['check_id'].split('.')[-1]
        file = r['path']
        sev = r.get('extra', {}).get('severity', 'INFO')
        # شيفرة التطبيق (src) أخطر من سكربتات التشغيل وملفات CI.
        app = file.startswith('src/')
        level = {'ERROR': 'high' if app else 'medium', 'WARNING': 'medium' if app else 'low'}.get(sev, 'info')
        key = f'semgrep|{rule}|{file}'
        g = grouped.setdefault(key, {'key': key, 'tool': 'semgrep', 'rule': rule, 'where': file, 'count': 0, 'severity': level})
        g['count'] += 1
    return list(grouped.values())


def zap_findings(path):
    data = json.load(open(path, encoding='utf-8'))
    grouped = {}
    for site in data.get('site', []):
        for a in site.get('alerts', []):
            level = {'3': 'high', '2': 'medium', '1': 'low'}.get(str(a.get('riskcode')), 'info')
            key = f"zap|{a.get('pluginid')}|{a.get('alert')}"
            g = grouped.setdefault(key, {'key': key, 'tool': 'zap', 'rule': a.get('alert'), 'where': 'الموقع (فحص سلبي)', 'count': 0, 'severity': level})
            g['count'] += int(a.get('count') or len(a.get('instances', [])) or 1)
    return list(grouped.values())


def apply_triage(findings, triage):
    for f in findings:
        entry = triage.get(f['key'])
        if entry is None:
            for pattern, value in triage.items():
                if pattern.startswith('_') or '*' not in pattern:
                    continue
                if fnmatch.fnmatch(f['key'], pattern):
                    entry = value
                    break
        f['status'] = (entry or {}).get('status', 'open')
        f['reason'] = (entry or {}).get('reason', '')
        if entry and entry.get('severity') in ORDER:
            f['severity'] = entry['severity']
    return findings


def blocking(f):
    return f['severity'] in ('critical', 'high') and f['status'] not in ('false-positive', 'accepted')


def counts(findings):
    c = {k: 0 for k in ORDER}
    for f in findings:
        if f['status'] != 'false-positive':
            c[f['severity']] += 1
    return c


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--semgrep'); ap.add_argument('--zap', action='append', default=[])
    ap.add_argument('--sha', required=True); ap.add_argument('--out-dir', default='security/reports')
    ap.add_argument('--triage', default='security/triage.json')
    ap.add_argument('--note', default=''); ap.add_argument('--gate', action='store_true')
    ap.add_argument('--no-write', action='store_true', help='بوابة فقط دون حفظ تقرير')
    args = ap.parse_args()

    findings = []
    tools = []
    if args.semgrep:
        findings += semgrep_findings(args.semgrep); tools.append('semgrep')
    seen = {}
    for z in args.zap:
        for f in zap_findings(z):
            if f['key'] in seen:
                seen[f['key']]['count'] = max(seen[f['key']]['count'], f['count'])
            else:
                seen[f['key']] = f
        if 'zap' not in tools:
            tools.append('zap')
    findings += list(seen.values())
    triage = json.load(open(args.triage, encoding='utf-8')) if os.path.exists(args.triage) else {}
    findings = apply_triage(findings, triage)
    findings.sort(key=lambda f: (ORDER.index(f['severity']), f['tool'], f['key']))

    previous = None
    prior = sorted(p for p in glob.glob(os.path.join(args.out_dir, '*.json')) if not p.endswith(f'-{args.sha[:7]}.json'))
    if prior:
        previous = json.load(open(prior[-1], encoding='utf-8'))
    prev_keys = {f['key'] for f in (previous or {}).get('findings', []) if f.get('status') != 'false-positive'}
    cur_keys = {f['key'] for f in findings if f['status'] != 'false-positive'}
    new_keys, fixed_keys = sorted(cur_keys - prev_keys), sorted(prev_keys - cur_keys)

    blockers = [f for f in findings if blocking(f)]
    today = datetime.date.today().isoformat()
    summary = {
        'release': args.sha, 'date': today, 'tools': tools, 'note': args.note,
        'counts': counts(findings), 'blocking': [f['key'] for f in blockers],
        'previous_release': (previous or {}).get('release'),
        'new_since_previous': new_keys if previous else None,
        'fixed_since_previous': fixed_keys if previous else None,
        'findings': findings,
    }

    if not args.no_write:
        os.makedirs(args.out_dir, exist_ok=True)
        base = os.path.join(args.out_dir, f'{today}-{args.sha[:7]}')
        json.dump(summary, open(base + '.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        c = summary['counts']
        lines = [f'# التقرير الأمني — الإصدار `{args.sha[:7]}`', '',
                 f'- التاريخ: {today}', f"- الأدوات: {', '.join(tools) or '—'}"]
        if args.note:
            lines.append(f'- ملاحظة: {args.note}')
        lines += ['', '## الخلاصة', '', '| حرجة | عالية | متوسطة | منخفضة | معلوماتية |', '|---|---|---|---|---|',
                  f"| {c['critical']} | {c['high']} | {c['medium']} | {c['low']} | {c['info']} |", '',
                  ('**البوابة: فشل** — نتائج حرجة/عالية غير معالجة: ' + '، '.join(f'`{k}`' for k in summary['blocking'])) if blockers
                  else '**البوابة: نجاح** — لا نتائج حرجة أو عالية مؤكدة.', '']
        lines += ['## مقارنة الإصدار السابق', '']
        if previous:
            pc = previous.get('counts', {})
            lines += [f"الإصدار السابق: `{str(previous.get('release'))[:7]}` بتاريخ {previous.get('date')}.", '',
                      '| التصنيف | السابق | الحالي |', '|---|---|---|']
            lines += [f"| {AR[k]} | {pc.get(k, 0)} | {c[k]} |" for k in ORDER]
            lines += ['', f'- نتائج جديدة: {len(new_keys)}' + (' — ' + '، '.join(f'`{k}`' for k in new_keys) if new_keys else ''),
                      f'- نتائج أُغلقت: {len(fixed_keys)}' + (' — ' + '، '.join(f'`{k}`' for k in fixed_keys) if fixed_keys else ''), '']
        else:
            lines += ['لا يوجد تقرير سابق — هذا خط الأساس.', '']
        lines += ['## النتائج', '', '| التصنيف | الأداة | القاعدة | الموضع | العدد | الحالة | المبرر |', '|---|---|---|---|---|---|---|']
        for f in findings:
            lines.append(f"| {AR[f['severity']]} | {f['tool']} | {f['rule']} | `{f['where']}` | {f['count']} | {STATUS_AR.get(f['status'], f['status'])} | {f['reason']} |")
        lines.append('')
        open(base + '.md', 'w', encoding='utf-8').write('\n'.join(lines))
        print(f'كُتب التقرير: {base}.md')

    c = summary['counts']
    print(f"حرجة={c['critical']} عالية={c['high']} متوسطة={c['medium']} منخفضة={c['low']} معلوماتية={c['info']}")
    if blockers:
        print('البوابة: فشل —', '، '.join(f['key'] for f in blockers))
        if args.gate:
            sys.exit(1)
    else:
        print('البوابة: نجاح')


if __name__ == '__main__':
    main()
