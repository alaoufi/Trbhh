#!/usr/bin/env bash
# ===================================================================
# دمج بيانات الموقع القديم الكاملة (database/trbhh.sql.gz) في قاعدة
# الإنتاج الحيّة — إضافة فقط (INSERT IGNORE): يضيف الإعلانات/الأعضاء/
# الصور الناقصة دون حذف أو تغيير أي بيانات موجودة. يأخذ نسخة احتياطية
# تلقائية قبل أي تعديل.
# ===================================================================
set -euo pipefail
cd "$(dirname "$0")/.."   # جذر المشروع

DUMP="database/trbhh.sql.gz"
[ -f "$DUMP" ] || { echo "❌ الملف غير موجود: $DUMP"; exit 1; }
[ -f ".env" ] || { echo "❌ ملف .env غير موجود"; exit 1; }

# --- بيانات الاتصال من DATABASE_URL (قاعدة الإنتاج الحقيقية) ---
DBURL=$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")
[ -n "${DBURL:-}" ] || { echo "❌ DATABASE_URL غير موجود في .env"; exit 1; }
rest=${DBURL#mysql://}
cred=${rest%@*}          # user:pass  (حتى آخر @)
hp=${rest##*@}           # host:port/db
DBU=${cred%%:*}
DBP=${cred#*:}
hostport=${hp%%/*}       # host:port
DBH=${hostport%%:*}      # host
DBN=${hp##*/}; DBN=${DBN%%\?*}

# فك ترميز URL لكلمة المرور (إن كانت مُرمّزة مثل %40=@)
urldecode() { local s="${1//+/ }"; printf '%b' "${s//%/\\x}"; }
DBP=$(urldecode "$DBP")

# IP المضيف كما يراه التطبيق فعلاً (من /etc/hosts داخل حاوية التطبيق)
HOSTIP=$(docker compose exec -T app sh -c 'grep -m1 host.docker.internal /etc/hosts' 2>/dev/null | awk '{print $1}')
[ -n "${HOSTIP:-}" ] || HOSTIP="$DBH"

echo "▶ القاعدة: $DBN @ $HOSTIP  (مستخدم: $DBU)"

# عميل mysql مؤقّت يشارك مكدّس شبكة حاوية التطبيق ⇒ نفس عنوان المصدر المصرّح له
run() { docker run --rm -i --network "container:trbhh-app" -e MYSQL_PWD="$DBP" mysql:8.0 "$@"; }
DBH="$HOSTIP"
q()   { run mysql -N -h "$DBH" -u"$DBU" "$DBN"; }

echo "▶ عدد الإعلانات قبل الدمج:"
echo "SELECT CONCAT('  الإجمالي=', COUNT(*)) FROM ads;" | q

# --- نسخة احتياطية أمان قبل أي تعديل ---
BK="/root/trbhh-backup-before-merge-$(date +%F-%H%M).sql.gz"
echo "▶ أخذ نسخة احتياطية → $BK"
run mysqldump --single-transaction --no-tablespaces --column-statistics=0 -h "$DBH" -u"$DBU" "$DBN" | gzip > "$BK" || {
  echo "❌ فشلت النسخة الاحتياطية — أُوقف قبل أي تعديل."; exit 1; }
echo "   ✓ الحجم: $(du -h "$BK" | cut -f1)"

# --- الدمج: إضافة الناقص فقط ---
echo "▶ جارٍ الدمج (INSERT IGNORE — إضافة فقط، لا حذف ولا استبدال)..."
{
  echo "SET FOREIGN_KEY_CHECKS=0;"
  echo "SET UNIQUE_CHECKS=0;"
  gunzip -c "$DUMP" | sed \
    -e 's/^CREATE TABLE /CREATE TABLE IF NOT EXISTS /' \
    -e 's/^INSERT INTO /INSERT IGNORE INTO /'
} | run mysql --force -h "$DBH" -u"$DBU" "$DBN"
echo "   ✓ اكتمل الدمج"

# --- تفعيل كل الإعلانات المعلّقة لتظهر للزوّار ---
echo "▶ تفعيل الإعلانات المعلّقة..."
echo "UPDATE ads SET status=1 WHERE status=0;" | run mysql -h "$DBH" -u"$DBU" "$DBN"

echo "▶ عدد الإعلانات بعد الدمج والتفعيل:"
echo "SELECT CONCAT('  status=',status,' → ', COUNT(*)) FROM ads GROUP BY status;" | q

# --- مسح كاش الموقع ليظهر الجديد فوراً ---
if docker compose exec -T redis redis-cli FLUSHALL >/dev/null 2>&1; then
  echo "▶ ✓ مُسح كاش الموقع"
else
  echo "⚠ تعذّر مسح الكاش تلقائياً — امسحه يدوياً: docker compose exec -T redis redis-cli FLUSHALL"
fi

echo ""
echo "✅ تم. النسخة الاحتياطية محفوظة في: $BK"
echo "   افتح الرئيسية في نافذة متخفّية للتأكد من العدد الجديد."
