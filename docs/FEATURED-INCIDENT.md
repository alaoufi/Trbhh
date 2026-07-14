# حادثة تصحيح «المميّز» — 2026-07-15

## ما حدث
اكتُشف أن آلاف إعلانات الليجاسي تظهر «مميّزة» (`adsSpecial='checked'`) بلا دفع حقيقي.
جرت محاولتان لتصحيح ذلك عبر عبارة `UPDATE` في `src/data/schema-sync.ts`:

1. **المحاولة ١ (زمنية):** إلغاء التمييز لكل ما لا `expires_at` له أو تجاوز مدة معيّنة.
   فشلت لأن تواريخ الليجاسي مضلّلة.
2. **المحاولة ٢ (سجلّ الدفع في `wallet_txns`):** إبقاء التمييز فقط لمن له صف في
   `wallet_txns` بسبب `featured`. **هذه ألغت التمييز عن الجميع تقريباً بالخطأ**،
   لأن الدفع الحقيقي لتمييز إعلانات الليجاسي مُسجَّل في جدول قديم منفصل اسمه
   **`transactions`** (`ads_id`, `status`, `image`, `transaction_id`) من نظام
   Laravel السابق — لا في `wallet_txns` (الذي بدأ مع إعادة البناء فقط).

## الوضع الحالي
- عبارة التصحيح **أُزيلت بالكامل** من `schema-sync.ts` — لا مزيد من التعديل
  التلقائي على `adsSpecial` حتى نتحقّق من المصدر الصحيح للدفع.
- **لم تُستعَد** الإعلانات المُلغى تمييزها بعد — بانتظار تشخيص دقيق (انظر الأمر
  أدناه) قبل أي كتابة جديدة على القاعدة الحيّة.

## خطوة التشخيص المطلوبة (قراءة فقط، لا تعديل)
شغّل هذا على الخادم لفهم شكل جدول `transactions` القديم وحجم الفرق قبل أي استرجاع:

```bash
cd /root/trbhh && docker compose exec -T app node - <<'EOF'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const cols = await p.$queryRawUnsafe("SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='transactions'");
  console.log('أعمدة transactions:', cols);
  const sample = await p.$queryRawUnsafe("SELECT * FROM transactions ORDER BY id DESC LIMIT 5");
  console.log('عيّنة من transactions:', sample);
  const cnt = await p.$queryRawUnsafe("SELECT status, COUNT(*) c FROM transactions GROUP BY status");
  console.log('توزيع status في transactions:', cnt);
  const distinctAds = await p.$queryRawUnsafe("SELECT COUNT(DISTINCT ads_id) c FROM transactions WHERE status=1");
  console.log('عدد الإعلانات المميّزة إن status=1 يعني مدفوع:', distinctAds);
  const currentChecked = await p.$queryRawUnsafe("SELECT COUNT(*) c FROM ads WHERE adsSpecial='checked'");
  console.log('عدد ads.adsSpecial=checked الآن:', currentChecked);
  await p.$disconnect();
})();
EOF
```

أرسل ناتج هذا الأمر كاملاً — به نحدّد المعيار الصحيح (مثلاً `transactions.status=1`)
ثم نبني عبارة استرجاع واحدة دقيقة تُعيد `adsSpecial='checked'` فقط لمن دفع فعلاً،
وتُدمج مع دفعات `wallet_txns` الحديثة (نظام ما بعد إعادة البناء) في معيار واحد.
