#!/usr/bin/env bash
# فحص الشيفرة كاملة بـSemgrep (إصدار مثبّت في security/versions.env).
# الاستعمال: security/semgrep.sh <ملف-الناتج.json>
# لا يرسل قياسات، ويستبعد الأسرار والملفات الحساسة عبر .semgrepignore.
set -euo pipefail
cd "$(dirname "$0")/.."
out="${1:?حدّد مسار ملف الناتج}"
. security/versions.env
have="$(semgrep --version 2>/dev/null || true)"
[[ "$have" == "$SEMGREP_VERSION" ]] || { echo "المطلوب semgrep==$SEMGREP_VERSION (الموجود: ${have:-غير مثبّت}). ثبّته: pip install semgrep==$SEMGREP_VERSION" >&2; exit 3; }
semgrep scan --metrics=off --quiet \
  --config p/owasp-top-ten --config p/typescript --config p/javascript --config p/react \
  --config p/nextjs --config p/nodejs --config p/sql-injection --config p/xss --config p/jwt \
  --config p/command-injection --config p/github-actions --config p/dockerfile \
  --config security/semgrep-local.yml \
  --json -o "$out" || { code=$?; [[ -s "$out" ]] || exit "$code"; }
echo "semgrep: كُتب الناتج في $out"
