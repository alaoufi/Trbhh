# منظومة الفحص الأمني — تربح

أداتان بإصدارات مثبّتة (`security/versions.env`): **Semgrep** لتحليل الشيفرة و**OWASP ZAP**
للفحص السلبي للموقع وواجهاته. لا شيء هنا يتصل بالإنتاج: ZAP وفحص الصلاحيات يرفضان أي هدف
غير `http://127.0.0.1:PORT`، ويعملان على نسخة محلية ببيانات مصطنعة (`scripts/preview/seed.mjs`).
**الفحص الهجومي النشط غير مضمَّن عمداً.**

| الملف | الغرض |
|---|---|
| `versions.env` | إصدار Semgrep وZAP وبصمة SHA-256 الرسمية لحزمة ZAP |
| `semgrep.sh` | فحص الشيفرة كاملة (قواعد السجل الرسمي + `semgrep-local.yml`) |
| `semgrep-local.yml` | قواعد خاصة بالمشروع تعمل بلا إنترنت |
| `zap-baseline.yaml` · `zap-local.sh` | خطة ZAP السلبية ومشغّلها (ينزّل ZAP ويتحقق من بصمته) |
| `authz-probe.cjs` | فحص الصلاحيات بحسابَي الاختبار `preview` و`preview-store` |
| `triage.json` | فرز النتائج: إنذار كاذب / مقبولة بمبرر / مؤكدة، مع السبب |
| `report.py` | التصنيف، المقارنة مع الإصدار السابق، وبوابة CI |
| `reports/` | تقرير لكل إصدار (`.md` مقروء + `.json` آلي) — بلا شيفرة ولا أسرار |
| `hooks/semgrep-changed.sh` | فحص خفيف لـClaude Code على الملف المعدَّل وحده |

## التصنيف والبوابة

- **عالية**: نتيجة Semgrep بمستوى ERROR داخل `src/`، أو تنبيه ZAP بخطورة High.
- **متوسطة**: ERROR خارج `src/` (سكربتات/CI)، WARNING داخل `src/`، ZAP Medium.
- **منخفضة / معلوماتية**: ما دون ذلك. **حرجة**: تُمنح يدوياً في `triage.json` لثغرة مؤكدة الاستغلال.
- البوابة (`report.py --gate`) تفشل عند أي حرجة/عالية ليست `false-positive` ولا `accepted`.
  لا تُسجَّل نتيجة كإنذار كاذب إلا بعد مراجعة يدوية وسبب مكتوب.

## CI

`.github/workflows/security.yml` يعمل عند كل push للفرع وكل PR وأسبوعياً: مهمة Semgrep، ومهمة
ZAP + الصلاحيات على نسخة يبنيها المشغّل نفسه بقاعدة MySQL مؤقتة. الإجراءات مثبّتة بـSHA.
النشر يدوي على الخادم (انظر `CLAUDE.md`)؛ **لا تنشر التزاماً فشل فيه «الفحص الأمني»**.

## التشغيل المحلي

```bash
pip install "semgrep==$(. security/versions.env; echo $SEMGREP_VERSION)"
security/semgrep.sh /tmp/semgrep.json
# نسخة محلية معزولة: MySQL مؤقت باسم trbhh_preview_audit ثم prisma db push و seed و build و next start
security/zap-local.sh http://127.0.0.1:3100 /tmp/zap
BASE=http://127.0.0.1:3100 PREVIEW_LOGIN_PASSWORD=... node security/authz-probe.cjs
python3 security/report.py --semgrep /tmp/semgrep.json --zap /tmp/zap/zap-baseline.json --sha "$(git rev-parse HEAD)" --gate
```

## تقرير كل إصدار

بعد فحص إصدار يُنشر، شغّل `report.py` بلا `--no-write` وأودِع الملفين الناتجين في `reports/`.
التقرير يقارن تلقائياً بآخر تقرير محفوظ: الجديد، وما أُغلق، وتغيّر الأعداد.

## حدود معروفة

- ZAP هنا سلبي فقط؛ لا يكتشف ما يحتاج هجوماً نشطاً (حقن، تجاوز منطق).
- حسابات الاختبار عضو وصاحب متجر؛ لا يوجد حساب إدارة مصطنع، فصفحات الإدارة تُفحص من جهة المنع فقط.
- فحص Claude Code الخفيف يعمل فقط إن كان `semgrep` مثبّتاً في الجلسة، وإلا يتجاوز بصمت.
