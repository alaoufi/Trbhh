#!/usr/bin/env bash
# فحص ZAP السلبي على نسخة محلية معزولة.
# الاستعمال: security/zap-local.sh <http://127.0.0.1:PORT> <مجلد-الناتج> [اسم-الملف]
# يرفض أي هدف غير loopback: الفحص لا يُوجَّه للإنتاج إطلاقاً.
# ينزّل ZAP من الإصدار الرسمي ويتحقق من SHA-256 المثبّت في security/versions.env.
set -euo pipefail
cd "$(dirname "$0")/.."
target="${1:?حدّد الهدف المحلي}"; outdir="$(mkdir -p "${2:?حدّد مجلد الناتج}" && cd "$2" && pwd)"; name="${3:-zap-baseline}"
[[ "$target" =~ ^http://(127\.0\.0\.1|localhost):[0-9]+$ ]] || { echo "مرفوض: الهدف يجب أن يكون http://127.0.0.1:PORT (بيئة محلية معزولة فقط)." >&2; exit 2; }
. security/versions.env
cache="${ZAP_CACHE_DIR:-$HOME/.cache/trbhh-security}"; zap_dir="$cache/ZAP_$ZAP_VERSION"
if [[ ! -x "$zap_dir/zap.sh" ]]; then
  mkdir -p "$cache"; tmp="$(mktemp -d)"
  curl -fsSL --retry 3 -o "$tmp/zap.tar.gz" "https://github.com/zaproxy/zaproxy/releases/download/v$ZAP_VERSION/ZAP_${ZAP_VERSION}_Linux.tar.gz"
  echo "$ZAP_LINUX_SHA256  $tmp/zap.tar.gz" | sha256sum -c - >/dev/null || { echo "بصمة ZAP لا تطابق المثبّتة — أُلغي التشغيل." >&2; rm -rf "$tmp"; exit 4; }
  tar -xzf "$tmp/zap.tar.gz" -C "$cache"; rm -rf "$tmp"
fi
plan="$(mktemp --suffix=.yaml)"; home="$(mktemp -d)"; trap 'rm -rf "$plan" "$home"' EXIT
sed -e "s|__TARGET__|$target|g" -e "s|__OUTDIR__|$outdir|g" -e "s|__OUTNAME__|$name|g" security/zap-baseline.yaml > "$plan"
timeout 1200 "$zap_dir/zap.sh" -cmd -dir "$home" -autorun "$plan" > "$outdir/$name.log" 2>&1 || true
[[ -s "$outdir/$name.json" ]] || { echo "ZAP لم يُخرج تقريراً — راجع $outdir/$name.log" >&2; exit 5; }
echo "zap: كُتب الناتج في $outdir/$name.json"
