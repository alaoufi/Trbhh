#!/usr/bin/env bash
# إعداد وتشغيل منصة تربح على VPS بأمر واحد.
# يُشغّل من داخل مجلد المشروع بعد استنساخه.
set -e

echo "==> [1/3] التحقق من Docker"
if ! command -v docker >/dev/null 2>&1; then
  echo "    تثبيت Docker..."
  curl -fsSL https://get.docker.com | sh
else
  echo "    Docker موجود."
fi

echo "==> [2/3] الإعدادات (.env)"
if [ ! -f .env ]; then
  cp .env.example .env
  SECRET=$(openssl rand -hex 32 2>/dev/null || head -c32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  sed -i "s/generate_a_64_char_hex_secret/$SECRET/" .env
  echo "    تم إنشاء .env وضبط مفتاح الجلسة."
else
  echo "    .env موجود مسبقاً."
fi

echo "==> [3/3] البناء والتشغيل (قد يأخذ 5-8 دقائق أول مرة)..."
docker compose up -d --build

echo ""
echo "=================================================="
IP=$(curl -fsS https://api.ipify.org 2>/dev/null || echo "IP-السيرفر")
echo "  ✅ تم النشر! افتح الموقع من متصفّحك:"
echo "     http://$IP:8080"
echo "=================================================="
echo ""
echo "  لمتابعة الحالة:  docker compose ps"
echo "  للسجلّات:        docker compose logs -f app"
