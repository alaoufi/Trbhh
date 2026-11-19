#!/usr/bin/env bash
# يثبّت rclone لاستعمال «تربح» فقط في /srv/trbhh/bin — من الموقع الرسمي، بإصدار مثبّت وبصمة
# SHA-256 مثبّتة هنا. لا يثبّت حزمة على النظام المشترك ولا يمس أدوات المواقع الأخرى.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "شغّله بصلاحية root" >&2; exit 2; }
VERSION=1.68.2
SHA256=0e6fa18051e67fc600d803a2dcb10ddedb092247fc6eee61be97f64ec080a13c
BIN=/srv/trbhh/bin/rclone
if [[ -x "$BIN" ]] && "$BIN" version 2>/dev/null | head -1 | grep -q "v$VERSION"; then echo "RCLONE_OK موجود: v$VERSION"; exit 0; fi
[[ "$(uname -m)" == x86_64 ]] || { echo "معمارية غير مدعومة: $(uname -m)" >&2; exit 3; }
work="$(mktemp -d /srv/trbhh/tmp/rclone.XXXXXX)"; trap 'rm -rf "$work"' EXIT
curl -fsSL -o "$work/rclone.zip" "https://downloads.rclone.org/v$VERSION/rclone-v$VERSION-linux-amd64.zip"
echo "$SHA256  $work/rclone.zip" | sha256sum -c - >/dev/null || { echo "البصمة لا تطابق — لم يُثبَّت شيء" >&2; exit 4; }
if command -v unzip >/dev/null; then unzip -q -o "$work/rclone.zip" -d "$work"
else python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$work/rclone.zip" "$work"; fi
install -d -m 755 /srv/trbhh/bin
install -m 755 "$work/rclone-v$VERSION-linux-amd64/rclone" "$BIN"
echo "RCLONE_OK $("$BIN" version | head -1)"
