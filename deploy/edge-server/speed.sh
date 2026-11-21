#!/usr/bin/env bash
# قياس سرعة «تربح» على الخادم نفسه (قراءة فقط): زمن إجابة الخادم لكل صفحة، ثلاث مرات، والوسيط بالملّي ثانية.
# يقيس التطبيق مباشرة على 127.0.0.1:8101 بلا شبكة ولا بوابة، فالرقم هو زمن الخادم الصافي.
set -euo pipefail
BASE=http://127.0.0.1:8101
H=(-H 'Host: trbhh.sa' -H 'X-Forwarded-Proto: https')
ms() { curl -s -o /dev/null --max-time 30 "${H[@]}" -w '%{http_code} %{time_starttransfer} %{size_download}\n' "$BASE$1" || echo '000 0 0'; }
ad="$(curl -s --max-time 30 "${H[@]}" "$BASE/" | grep -oE '/ads/[0-9]+' | head -n1 || true)"
img="$(curl -s --max-time 30 "${H[@]}" "$BASE/" | grep -oE '/media/[^"&? ]+\.(jpg|jpeg|png|webp)' | head -n1 || true)"
slow=0
printf '%-22s %5s %8s %9s\n' page code ms bytes
for p in / /search /companies /requests /login /guide ${ad:+"$ad"} ${img:+"$img"} /logo-header-132.webp; do
  ts=(); code=; size=
  for _ in 1 2 3; do read -r code t size < <(ms "$p"); ts+=("$(awk -v t="$t" 'BEGIN{printf "%d", t*1000}')"); done
  med="$(printf '%s\n' "${ts[@]}" | sort -n | sed -n 2p)"
  printf '%-22s %5s %8s %9s\n' "${p:0:22}" "$code" "$med" "$size"
  [[ "$code" == 200 && "$med" -le 800 ]] || slow=$((slow+1))
done
cache="$(curl -s -o /dev/null -D - --max-time 10 "${H[@]}" "$BASE/logo-header-132.webp" | grep -i '^cache-control' | tr -d '\r' || true)"
echo "logo ${cache:-cache-control: (none)}"
if [[ "$slow" -eq 0 ]]; then echo "SPEED_OK"; else echo "SPEED_SLOW pages=$slow (أكثر من 800ms أو ليست 200)"; fi
