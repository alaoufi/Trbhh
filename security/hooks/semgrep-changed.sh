#!/usr/bin/env bash
# فحص أمني خفيف لـClaude Code: يفحص الملف المُعدَّل وحده بالقواعد المحلية (بلا إنترنت، ثوانٍ).
# لا يشغّل الفحص الشامل. يتجاهل بصمت إن لم يكن semgrep مثبّتاً أو الملف خارج النطاق.
# عند وجود نتيجة يخرج بالرمز 2 ويكتب الملاحظة على stderr لتصل إلى Claude.
set -uo pipefail
root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
file="$(python3 -c 'import json,sys
try:
    d=json.load(sys.stdin); print(d.get("tool_input",{}).get("file_path") or d.get("tool_response",{}).get("filePath") or "")
except Exception: print("")' 2>/dev/null)"
[[ -n "$file" && -f "$file" ]] || exit 0
case "$file" in
  "$root"/src/*.ts|"$root"/src/*.tsx|"$root"/scripts/*.cjs|"$root"/scripts/*.mjs|"$root"/scripts/*.ts) ;;
  *) exit 0 ;;
esac
command -v semgrep >/dev/null 2>&1 || exit 0
out="$(cd "$root" && timeout 40 semgrep scan --metrics=off --quiet --disable-version-check --config security/semgrep-local.yml --json "$file" 2>/dev/null)" || true
[[ -n "$out" ]] || exit 0
# النتائج المفروزة سابقاً في security/triage.json (إنذار كاذب/مقبولة) لا تُعاد.
msg="$(printf '%s' "$out" | ROOT="$root" python3 -c 'import json,os,sys
try: d=json.load(sys.stdin)
except Exception: sys.exit(0)
root=os.environ["ROOT"]
try: triage=json.load(open(os.path.join(root,"security/triage.json"),encoding="utf-8"))
except Exception: triage={}
for r in d.get("results",[]):
    rule=r["check_id"].split(".")[-1]; rel=os.path.relpath(r["path"],root) if os.path.isabs(r["path"]) else r["path"]
    if (triage.get("semgrep|%s|%s" % (rule,rel)) or {}).get("status") in ("false-positive","accepted"): continue
    print("- %s:%s [%s] %s" % (rel, r["start"]["line"], rule, r["extra"]["message"]))' 2>/dev/null)"
[[ -n "$msg" ]] || exit 0
{ echo "فحص أمني خفيف (security/semgrep-local.yml) — راجع قبل المتابعة؛ إن كان إنذاراً كاذباً بعد المراجعة فسجّله في security/triage.json:"; echo "$msg"; } >&2
exit 2
