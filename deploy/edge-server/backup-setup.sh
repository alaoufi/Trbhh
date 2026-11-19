#!/usr/bin/env bash
# تفعيل النسخ الاحتياطي اليومي المشفّر لـ«تربح» — مرة واحدة بعد ربط مخزن النسخ (r2-setup.sh backups):
#   1. مفتاح تشفير في /etc/trbhh/backup.key (لا يُطبع أبداً؛ ينسخه المالك بـscp ويحفظه خارج الخادم).
#   2. cron لتربح فقط: نسخة يومية 03:17، ومراقب «خذ نسخة الآن» كل دقيقة.
#   3. نسخة أولى الآن ثم اختبار استرجاع فعلي لها.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "شغّله بصلاحية root" >&2; exit 2; }
umask 077
D=/opt/trbhh/deploy/edge-server
KEY=/etc/trbhh/backup.key
grep -q '^\[trbhh-backups\]' /etc/trbhh/rclone.conf 2>/dev/null || { echo "اربط مخزن النسخ أولاً: bash $D/r2-setup.sh backups <ACCOUNT_ID>" >&2; exit 2; }
if [[ ! -s "$KEY" ]]; then openssl rand -base64 48 > "$KEY"; chmod 600 "$KEY"; echo "أُنشئ مفتاح التشفير (لم يُطبع)"; else echo "مفتاح التشفير موجود — لم يُغيَّر"; fi
cat > /etc/cron.d/trbhh-backup <<CRON
# النسخ الاحتياطي لتربح (deploy/edge-server/backup-setup.sh) — لا يمس أي موقع آخر.
17 3 * * * root /usr/bin/bash $D/backup.sh daily >> /var/log/trbhh-backup.log 2>&1
* * * * * root /usr/bin/bash $D/backup-watch.sh
CRON
chmod 644 /etc/cron.d/trbhh-backup
bash "$D/backup.sh" manual
bash "$D/backup-verify.sh"
echo
echo "BACKUP_SETUP_OK"
echo "مهم: انسخ مفتاح التشفير إلى جهازك ثم إلى مدير كلمات المرور (بدونه لا تُستعاد أي نسخة):"
echo "  scp root@84.247.166.216:$KEY ."
