# تقرير جاهزية ما قبل الإنتاج — 2026-10-01

## القرار

**NOT READY FOR FINAL EXTERNAL REVIEW**

الكود ونسخة المعاينة اجتازا البوابات التقنية المسجلة أدناه، لكن جودة البيانات العامة لا تحقق معيار الاعتماد بعد:

- P0 برمجي: **0**.
- P1 برمجي: **0**.
- `BLOCKING_PUBLIC` في التصنيف: **420 إعلانًا عامًا**.
- `BLOCKING_PUBLIC` في عرض الحقول الخاطئة المعروفة بعد الحماية: **0**؛ القيم الخام بقيت في قاعدة البيانات ولم تعد تعرض كمواصفات موثوقة.
- أوراق Leaf المراجعة مهنيًا: **83 PASS** و**2 NEEDS_CONDITIONAL_CHANGE**.
- لم يُنشر هذا الفرع إلى `main` أو إلى إنتاج `trbhh.sa`.
- الطلبات والمدفوعات الحقيقية للموردين بقيت معطلة: `SUPPLIER_ALLOW_LIVE_ORDERS=false`.

لا يجوز الانتقال إلى المراجعة الخارجية النهائية قبل إغلاق مانعات التصنيف العامة الـ420 ومعالجة الورقتين غير المجتازتين، ثم إعادة التدقيق.

## نسخة المعاينة والأدلة

- الرابط: https://preview.88-223-92-124.sslip.io/
- الفرع: `codex/trbhh-platform-enhancement-20260929`.
- نسخة السلوك المنشورة والمفحوصة على Preview: `21a7e0ced38ecfc953916beb5103a68865328db3`.
- CI للسلوك والتدقيق: [run 36866556275](https://github.com/alaoufi/Trbhh/actions/runs/36866556275) — ناجح.
- نشر Preview للنسخة نفسها: [run 36866587142](https://github.com/alaoufi/Trbhh/actions/runs/36866587142) — ناجح.
- CI لدورات العائلات الست على commit `b9b48748ee09d79027ec15b8ce4cac7a92699d5a`: [run 36868918049](https://github.com/alaoufi/Trbhh/actions/runs/36868918049) — ناجح.
- `GET /` من عميل مجهول يعيد 200 دون Cookie أو Authorization، مع `X-Trbhh-Preview-Mode: read-only` و`X-Robots-Tag: noindex, nofollow, noarchive` ومن دون `WWW-Authenticate`.
- Preview متصل بقاعدة البيانات الحية للقراءة فقط؛ لا migrations ولا seed ولا تصحيح آلي ولا دفع ولا طلب مورد.

## تفسير invalid_subcategory

الرقم القديم **432** لم يكن 432 نوع خطأ مختلفًا؛ كلها إعلانات بلا `subcategory_id`. بعد إضافة التحقق الدلالي اكتُشفت **25** حالة إضافية تشير إلى Leaf موجود تقنيًا لكنه خاطئ بالنسبة لمحتوى الإعلان. لذلك أصبح الإجمالي لجميع السجلات **457**، وفي الإعلانات العامة **420**.

| السبب الفعلي | جميع الإعلانات | الإعلانات العامة |
|---|---:|---:|
| `subcategory_missing` | 432 | 395 |
| `subcategory_not_found` | 0 | 0 |
| `parent_child_mismatch` | 0 | 0 |
| `legacy_id` | 0 | 0 |
| `duplicate_category` | 0 | 0 |
| `category_remapped` | 0 | 0 |
| `ad_points_to_wrong_leaf` | 25 | 25 |
| `schema_key_mismatch` | 0 | 0 |
| `other` | 0 | 0 |
| **الإجمالي** | **457** | **420** |

لم ينفذ أي `AUTO_FIX`: لا توجد في العينة الحالية خريطة قطعية من معرّف قديم إلى معرّف Canonical جديد. لا يُستخدم العنوان لتغيير التصنيف آليًا؛ الحالات غير القطعية موسومة للمراجعة التحريرية.

## إعادة تصنيف حالات المراجعة

الأثر الأساسي لجميع الإعلانات البالغ عددها 765:

| الأثر | العدد |
|---|---:|
| `BLOCKING_PUBLIC` | 457 |
| `SAFE_LEGACY` | 29 |
| `EDITORIAL_ONLY` | 275 |

الأثر الأساسي للإعلانات العامة البالغ عددها 724:

| الأثر | العدد |
|---|---:|
| `BLOCKING_PUBLIC` | 420 |
| `SAFE_LEGACY` | 28 |
| `EDITORIAL_ONLY` | 272 |

`needsEditorReview` علامة مستقلة وقد تتقاطع مع الأثر الأساسي: **457** في جميع السجلات و**420** في العامة. لذلك لا تجمع هذه الأعداد كفئات منفصلة.

## الحالات المؤكدة وحماية العرض

### الإعلان 3412 — مقاول شبوك ونخيل

- الإعلان خدمة مقاولات، لكنه يشير إلى Leaf سلعي للأدوات/الأدوات الصحية أو مواد البناء.
- سبب التدقيق: `service_in_goods_leaf` ضمن `ad_points_to_wrong_leaf`.
- التصنيف: `BLOCKING_PUBLIC` و`NEEDS_EDITOR_REVIEW`.
- أصلح السبب الجذري في إسقاط الحقول العام: إذا كان محتوى الخدمة داخل Leaf سلعي غير متوافق فلا تعرض أي مواصفة قياسية من ذلك Leaf.
- `GET /ads/3412` يعيد 200، وحقل «المادة» غير ظاهر للعامة. القيم الخام لم تحذف.

### الإعلان 3420 — قيم الرفع غير المنطقية

- السبب: `lifting_kind_conflict`؛ نوع المعدة المستدل بثقة من الإعلان لا يطابق نوع المعدة الذي بنيت عليه المواصفات القديمة.
- القيم القديمة، ومنها `الطراز=2` و`قدرة المحرك=1 كيلوواط` و`حمولة الرفع المقننة=640 طن`، محفوظة للتدقيق لكنها محجوبة عن العرض العام.
- `GET /ads/3420` يعيد 200، ولا تظهر للعامة تسميات «الطراز» أو «قدرة المحرك» أو «حمولة الرفع المقننة».
- المخطط الحالي لم يعد يستخدم `capacity_t` العام؛ النطاقات منفصلة حسب النوع: كرين `0.5–2000 طن`، رافعة شوكية `0.5–80 طن`، تليسكوبية `0.5–50 طن`، ومنصة `50–2000 كجم`، وقدرة المحرك تبدأ من 2. اختبارات التحقق ترفض الإدخال الجديد المخالف.
- القرار للسجل القديم: `NEEDS_EDITOR_REVIEW`؛ لا تصحيح تخميني ولا عرض عام للقيمة غير الموثوقة.

قاعدة التنفيذ هي: **Preserve لا يعني Display**. القيم غير الصالحة أو غير المنتمية للـLeaf أو ذات الوحدة غير الموثوقة تبقى raw داخليًا، ولا تظهر في البطاقة أو التفاصيل كمواصفات قياسية.

## الموقع الجغرافي

| الحالة العامة | العدد |
|---|---:|
| `missing_location` | 192 |
| `location_mismatch` | 1 |
| المستبعد بأمان من «قريب منك» والترتيب الجغرافي | 193 |

في جميع السجلات: `missing_location=217` و`location_mismatch=1`. لا يُستنتج الموقع من العنوان. الإعلانات الجديدة تتحقق خادميًا من علاقة المنطقة بالمدينة، والإعلانات القديمة غير الموثوقة لا تدخل في ميزات القرب أو نقاط الترتيب الجغرافي حتى تراجع.

## تفسير 724 مقابل 667

العد الفعلي على Preview للسياسة التي يستطيع التطبيق قراءتها:

- إعلانات active الأساسية: **724**.
- مستبعدة لأن صاحبها محظور: **57**.
- مستبعدة بالعمر/الباقة في Runtime Preview: **0**.
- الظاهر في البحث: **667**.

كان عد الرئيسية يستخدم active مباشرة بينما البحث يطبق شروط الظهور. عُدلت الرئيسية لتستخدم `countSearchAds({})`؛ والآن تعرض الرئيسية **667 إعلانًا نشطًا** والبحث من دون فلتر **667 نتيجة**.

هناك محاكاة منفصلة لسياسة الباقات المهيأة: لو أمكن تطبيق مدة الباقة فستستبعد **559** إعلانًا إضافيًا بالعمر ويكون الناتج **108**. Preview الحي يستخدم مستخدم قراءة فقط؛ محمّل الباقات يحاول ضمان جداول مساعدة ثم يفشل إلى افتراض مدة غير محدودة. هذا فرق موثق يجب حسم السياسة التجارية له قبل أي إطلاق، ولا يمثل الرقم الفعلي المعروض حاليًا.

## Taxonomy وSchema source

- Main الفعالة: **28**.
- Leaf: **85**.
- تعريفات Leaf المخزنة في DB: **30**.
- البقية لا تستخدم fallback مجهولًا: **55** تأتي من قوالب كود مسماة حسب المسار الكامل، ثم يدمجها `service.ts` مع تعريف DB عندما يوجد.

| Schema source | العدد |
|---|---:|
| DB | 30 |
| Code template | 55 |
| Inherited | 0 |
| Fallback | 0 |

## التدقيق المهني لجميع أوراق Leaf

الأعمدة: المفتاح، المسار، المصدر، عدد الحقول، المطلوبة، الشرطية، النتيجة.

| Leaf key | Category path | Source | Fields | Required | Conditional | QA |
|---|---|---|---:|---:|---:|---|
| car | سيارات ومستلزماتها / سيارات | DB | 18 | 2 | 0 | PASS |
| car_parts | سيارات ومستلزماتها / قطع غيار وإكسسوارات | DB | 9 | 0 | 0 | PASS |
| job | وظائف / فرص عمل | DB | 14 | 1 | 0 | PASS |
| plants | زراعة ومشاتل وأعلاف / شتلات ونباتات | DB | 8 | 0 | 0 | PASS |
| feed | زراعة ومشاتل وأعلاف / أعلاف | DB | 9 | 0 | 0 | PASS |
| irrigation | زراعة ومشاتل وأعلاف / مستلزمات ري | DB | 9 | 0 | 0 | PASS |
| garden_service | زراعة ومشاتل وأعلاف / خدمات زراعة وحدائق | DB | 7 | 0 | 0 | PASS |
| sheep_goats | مواشي ومستلزماتها / أغنام وماعز | DB | 11 | 0 | 0 | PASS |
| camels_cattle | مواشي ومستلزماتها / إبل وأبقار | DB | 11 | 0 | 0 | PASS |
| poultry | مواشي ومستلزماتها / دواجن | DB | 11 | 0 | 0 | PASS |
| livestock_equipment | مواشي ومستلزماتها / معالف وسقايات وتجهيزات | DB | 10 | 0 | 0 | PASS |
| cookware | أوانٍ منزلية / أواني طبخ | DB | 14 | 0 | 0 | PASS |
| tableware | أوانٍ منزلية / تقديم ومائدة | DB | 12 | 0 | 0 | PASS |
| storage | أوانٍ منزلية / حفظ وتنظيم | DB | 12 | 0 | 0 | PASS |
| rugs | ديكورات منزلية / سجاد | DB | 12 | 0 | 0 | PASS |
| curtains | ديكورات منزلية / ستائر | DB | 12 | 0 | 0 | PASS |
| wall_decor | ديكورات منزلية / مرايا ولوحات | DB | 11 | 0 | 0 | PASS |
| decor_service | ديكورات منزلية / تفصيل وتركيب ديكور | DB | 7 | 0 | 0 | PASS |
| tiles | مواد بناء ومقاولات / بلاط وأرضيات | DB | 10 | 0 | 0 | PASS |
| building_materials | مواد بناء ومقاولات / مواد بناء أساسية | DB | 8 | 0 | 0 | PASS |
| sanitary | مواد بناء ومقاولات / أدوات صحية | DB | 12 | 0 | 0 | PASS |
| contracting | مواد بناء ومقاولات / مقاولات وتشطيبات | DB | 7 | 0 | 0 | PASS |
| earthmoving | نقليات ومعدات ثقيلة / معدات حفر وتحميل | DB | 15 | 0 | 0 | PASS |
| lifting | نقليات ومعدات ثقيلة / رافعات ومناولة | DB | 15 | 0 | 0 | PASS |
| commercial_vehicles | نقليات ومعدات ثقيلة / شاحنات ومقطورات | DB | 19 | 2 | 0 | PASS |
| transport_service | نقليات ومعدات ثقيلة / خدمات نقل وتشغيل | DB | 7 | 0 | 0 | PASS |
| land | عقارات / أراضٍ | DB | 13 | 1 | 0 | PASS |
| villa | عقارات / فلل | DB | 23 | 1 | 0 | PASS |
| apartment | عقارات / شقق وأدوار | DB | 12 | 0 | 0 | PASS |
| commercial_property | عقارات / محلات ومكاتب ومستودعات | DB | 12 | 0 | 0 | PASS |
| legacy_sheep | المواشي والحيوانات ومستلزماتها / ضأن | code_template | 11 | 4 | 0 | PASS |
| legacy_camels | المواشي والحيوانات ومستلزماتها / ابل | code_template | 12 | 4 | 0 | PASS |
| legacy_goats | المواشي والحيوانات ومستلزماتها / ماعز | code_template | 11 | 4 | 0 | PASS |
| legacy_horses | المواشي والحيوانات ومستلزماتها / خيول ومستلزماتها | code_template | 8 | 2 | 0 | PASS |
| legacy_birds | المواشي والحيوانات ومستلزماتها / طيور | code_template | 8 | 3 | 0 | PASS |
| legacy_pets | المواشي والحيوانات ومستلزماتها / حيوانات اليفة | code_template | 8 | 3 | 0 | PASS |
| legacy_vehicles | نقليات سيارات معدات / سيارات | code_template | 17 | 5 | 1 | PASS |
| legacy_heavy_equipment | نقليات سيارات معدات / معدات | code_template | 18 | 6 | 3 | NEEDS_CONDITIONAL_CHANGE |
| legacy_equipment_rental | نقليات سيارات معدات / تأجير | code_template | 8 | 1 | 0 | NEEDS_CONDITIONAL_CHANGE |
| legacy_medical_devices | الصحة واللياقة / اجهزة طبية | code_template | 9 | 2 | 0 | PASS |
| legacy_hospitals | الصحة واللياقة / مستشفيات وعيادات | code_template | 9 | 3 | 0 | PASS |
| legacy_fitness | الصحة واللياقة / رياضة ولياقة | code_template | 8 | 2 | 0 | PASS |
| legacy_training_centers | الصحة واللياقة / مراكز اللياقة والتدريب | code_template | 8 | 3 | 0 | PASS |
| legacy_optics | الصحة واللياقة / بصريات نظارات عدسات | code_template | 8 | 2 | 0 | PASS |
| legacy_graphic_design | دعاية واعلان / رسم وتصميم | code_template | 8 | 2 | 0 | PASS |
| legacy_ad_campaigns | دعاية واعلان / حملات اعلانية | code_template | 9 | 2 | 0 | PASS |
| legacy_ads | دعاية واعلان / اعلانات | code_template | 8 | 2 | 0 | PASS |
| legacy_calligraphy | دعاية واعلان / خطاط | code_template | 8 | 2 | 0 | PASS |
| legacy_art_direction | دعاية واعلان / تصميم واخراج | code_template | 8 | 2 | 0 | PASS |
| legacy_womens_salon | مشاغل نسائية وتجميل / مشاغل نسائية | code_template | 8 | 3 | 0 | PASS |
| legacy_beauty_tools_salon | مشاغل نسائية وتجميل / ادوات تجميل | code_template | 9 | 2 | 0 | PASS |
| legacy_beauty_clinics | مشاغل نسائية وتجميل / عيادات التجميل | code_template | 9 | 3 | 0 | PASS |
| legacy_programming | برمجة وتصميم / برمجه | code_template | 8 | 2 | 0 | PASS |
| legacy_design | برمجة وتصميم / تصميم | code_template | 8 | 2 | 0 | PASS |
| legacy_menswear | ملابس وعطورات / ملابس رجالية | code_template | 9 | 3 | 0 | PASS |
| legacy_childrenswear | ملابس وعطورات / ملابس اطفال | code_template | 10 | 4 | 0 | PASS |
| legacy_womenswear | ملابس وعطورات / ملابس نسائية | code_template | 9 | 3 | 0 | PASS |
| legacy_accessories | ملابس وعطورات / اكسسوارات | code_template | 8 | 2 | 0 | PASS |
| legacy_perfumes | ملابس وعطورات / عطورات | code_template | 8 | 3 | 0 | PASS |
| legacy_beauty_tools_apparel | ملابس وعطورات / ادوات تجميل | code_template | 9 | 2 | 0 | PASS |
| legacy_shoes_bags | ملابس وعطورات / احذية وشنط | code_template | 9 | 3 | 0 | PASS |
| legacy_underwear | ملابس وعطورات / ملابس داخلية | code_template | 10 | 3 | 0 | PASS |
| legacy_cooling | اجهزة كهربائية / مكيفات وثلاجات | code_template | 11 | 4 | 0 | PASS |
| legacy_kitchen_appliances | اجهزة كهربائية / اجهزة مطبخ | code_template | 10 | 4 | 0 | PASS |
| legacy_motors_generators | اجهزة كهربائية / مواطير ومولدات | code_template | 12 | 5 | 0 | PASS |
| legacy_phones | الكترونيات / جوالات | code_template | 11 | 5 | 0 | PASS |
| legacy_televisions | الكترونيات / تلفزيونات | code_template | 11 | 5 | 0 | PASS |
| legacy_gaming | الكترونيات / العاب الكترونية | code_template | 10 | 4 | 0 | PASS |
| legacy_computers | الكترونيات / كمبيوتر ولابتوب | code_template | 12 | 4 | 0 | PASS |
| legacy_tablets | الكترونيات / تابلت | code_template | 11 | 5 | 0 | PASS |
| legacy_device_repair | الكترونيات / صيانة اجهزة | code_template | 8 | 2 | 0 | PASS |
| legacy_audio_wearables | الكترونيات / سماعات وساعات | code_template | 10 | 4 | 0 | PASS |
| legacy_furniture | اثاث مفروشات ديكورات / مفروشات | code_template | 10 | 3 | 0 | PASS |
| legacy_decor | اثاث مفروشات ديكورات / ديكورات | code_template | 11 | 3 | 0 | PASS |
| legacy_nursery_plants | المشاتل ومستلزماتها / شتلات | code_template | 8 | 3 | 0 | PASS |
| legacy_garden_tools | المشاتل ومستلزماتها / ادوات الحدائق | code_template | 8 | 2 | 0 | PASS |
| legacy_produce | المزارع و منتجاتها / خضار وفواكه | code_template | 12 | 4 | 0 | PASS |
| legacy_farm_feed | المزارع و منتجاتها / اعلاف | code_template | 11 | 4 | 0 | PASS |
| legacy_building_tools | مقاولات مواد بناء / ادوات بناء | code_template | 8 | 2 | 0 | PASS |
| legacy_tiles | مقاولات مواد بناء / بلاط سيراميك رخام | code_template | 13 | 3 | 0 | PASS |
| legacy_government_services | الخدمات العامة والتعقيب / تعقيب مراجعات | code_template | 7 | 3 | 0 | PASS |
| legacy_legal | الخدمات العامة والتعقيب / محاماة | code_template | 8 | 2 | 0 | PASS |
| legacy_home_food | الأسر المنتجة / اطعمة ومأكولات | code_template | 13 | 2 | 0 | PASS |
| legacy_drinks | الأسر المنتجة / عصائر ومشروبات | code_template | 14 | 2 | 0 | PASS |
| legacy_handmade_textiles | الأسر المنتجة / مشغولات ومنسوجات | code_template | 7 | 2 | 0 | PASS |

سبب الحالتين غير المجتازتين:

1. `legacy_heavy_equipment`: Leaf قديم يجمع معدات الرفع والحفر؛ حقول السعة والارتفاع والطاقة تحتاج شروطًا أدق حسب نوع المعدة.
2. `legacy_equipment_rental`: السعة والطاقة والارتفاع يجب أن تكون مشروطة بنوع المعدة، بدل الاكتفاء بالمخطط العام.

## Broken Link Crawl

Crawler فعلي اتبع جميع روابط GET الداخلية العامة المكتشفة في Preview حتى نفاد الطابور:

| النتيجة | العدد |
|---|---:|
| `TOTAL_DISCOVERED` | 1738 |
| 2xx | 1738 |
| 3xx | 0 |
| 4xx | 0 |
| 5xx | 0 |
| Network errors | 0 |

- قائمة 404: `[]`.
- قائمة 500: `[]`.
- `truncated=false`؛ لم يتوقف الزاحف بسبب حد داخلي.

## Browser QA المعزول

القاعدة: MySQL مخصصة على loopback فقط باسم `trbhh_commerce_preview_20260919`. يرفض الاختبار أي host أو port أو اسم قاعدة آخر.

العائلات الست:

1. goods — سيارات.
2. property — أراضٍ.
3. jobs — فرص عمل.
4. service — خدمات زراعة وحدائق.
5. livestock — أغنام وماعز.
6. plants — شتلات ونباتات.

لكل عائلة ينفذ الاختبار: تسجيل دخول بحساب اصطناعي مستقل → اختيار Main/Leaf → ملء الحقول المطلوبة → إنشاء → تفاصيل → تعديل → بحث بالنص مع فلتر Main وLeaf → حذف. الاتصالات الخارجية محجوبة، والشراء الحي معطل.

## الملخص المطلوب

### Taxonomy

- Main: **28**.
- Leaf: **85**.
- PASS: **83**.
- NEEDS_CHANGE: **2**.

### Schema source

- DB: **30**.
- Code template: **55**.
- Inherited: **0**.
- Fallback: **0**.

### Live data

- Total ads: **765**.
- Valid: **4**.
- Safe legacy: **28 عامة** (**29** في جميع السجلات).
- Blocking public: **420**.
- Needs editor review: **420 عامة** (**457** في جميع السجلات).

### Category mismatch

- Before: **432** مفقودة الفرع في التدقيق القديم؛ **457** بعد إضافة 25 خطأ Leaf دلالي.
- Auto-fixed: **0**.
- Remaining blocking: **420 عامة** = 395 مفقودة الفرع + 25 Leaf خاطئ دلاليًا.

### Wrong-field display

- Before: **25** حالة Leaf خاطئ دلاليًا مع احتمال عرض حقول غير مناسبة.
- Fixed: **25** محجوبة من الإسقاط العام مع بقاء raw داخليًا.
- Remaining known public display: **0**.

### Location

- Missing: **192 عامة**.
- Mismatch: **1 عامة**.
- Excluded safely from geo features: **193**.

### Crawl

- URLs discovered: **1738**.
- 2xx: **1738**.
- 3xx: **0**.
- 4xx: **0**.
- 5xx: **0**.

### E2E

- Main/Schema families tested with full lifecycle: **6**.

## الاختبارات والملفات

- TypeScript: ناجح.
- ESLint: 0 errors و5 warnings قديمة غير حاجبة.
- Vitest محلي: 202 ملفًا؛ **201 passed + 1 skipped**. الاختبارات: **1358 passed + 9 skipped**.
- Build: ناجح؛ بقيت تحذيرات Turbopack المعروفة في `src/lib/storage.ts`.
- الملفات المحورية: `src/lib/ad-quality/audit.ts`، `src/lib/ad-categories/public-trust.ts`، `src/lib/ad-categories/seed-templates.ts`، `src/lib/ad-categories/quality-review.ts`، `src/lib/data.ts`، `scripts/release/audit-live-ad-quality.cjs`، `scripts/release/crawl-public-preview.cjs`، `tests/preview/browser.cjs`، و`tests/preview/setup.test.ts`.
- لا توجد migration جديدة في هذه الجولة، ولم تكتب أي بيانات إنتاج.

## ما يلزم قبل تغيير القرار

1. مراجعة يدوية للـ420 إعلانًا العام المانع وتصحيح التصنيف قطعيًا أو إخفاؤه تحريريًا.
2. تقسيم/تشريط حقول `legacy_heavy_equipment` و`legacy_equipment_rental` وإعادة QA.
3. حسم سياسة انتهاء إعلانات الباقات التي تظهر محاكاتها 108 مقابل Runtime Preview الحالي 667.
4. إعادة تدقيق البيانات، crawler، والعائلات الست بعد التصحيح.
5. إذا أصبحت مانعات التصنيف والعرض صفرًا فقط، يمكن تغيير القرار إلى **READY FOR FINAL EXTERNAL REVIEW**. هذا لا يعني نشر الإنتاج؛ النقل العام يحتاج موافقة ونسخة احتياطية ونقطة رجوع مستقلة.
