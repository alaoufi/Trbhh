import Link from 'next/link';
import { Settings, Check, BarChart3, Eye } from 'lucide-react';
import { requireAction } from '@/lib/roles';
import { getMemberWindows, getMsgDeleteMinutes, getSettingBool, getClassifiedStatsAudience, getClassifiedLifetimeDays, getClassifiedSplashSeconds, getAppConfig, getHomeStats, HOME_STAT_KEYS, HOME_STAT_LABELS, SETTING_ADS_APPROVAL, getDupThresholds, getClassifiedDupConfig, getAdLifetimeDays, getAdRestoreFee, getStrikeBanDays } from '@/lib/settings';
import { Button } from '@/components/ui/button';
import { saveSettingsAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الإعدادات' };

export default async function AdminSettings({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireAction('users', 'edit');
  const [{ saved }, w, msgDeleteMin, homeStats, statsAudience, classifiedDays, splashSeconds, adsApproval, appCfg, dupThresholds, cdup, pushOn, suggestOn, savedSearchOn, matchNotifyOn, storeReportOn, scheduleOn, bumpOn, adContactStatsOn, couponsOn, stockOn, hoursOn, dealsOn, autoRenewOn, auctionOn, staffOn, nameLockOn, homeActionsOn, catsOn, debatesOn, archiveAutodeleteOn, adLifetimeDays, adRestoreFee, strikeBanDays] = await Promise.all([searchParams, getMemberWindows(), getMsgDeleteMinutes(), getHomeStats(), getClassifiedStatsAudience(), getClassifiedLifetimeDays(), getClassifiedSplashSeconds(), getSettingBool(SETTING_ADS_APPROVAL, false), getAppConfig(), getDupThresholds(), getClassifiedDupConfig(), getSettingBool('push_on', false), getSettingBool('search_suggest_on', true), getSettingBool('saved_search_on', true), getSettingBool('match_notify_on', false), getSettingBool('store_report_on', false), getSettingBool('schedule_on', false), getSettingBool('bump_on', false), getSettingBool('ad_contact_stats_on', true), getSettingBool('coupons_on', false), getSettingBool('stock_on', false), getSettingBool('hours_on', false), getSettingBool('deals_on', false), getSettingBool('autorenew_on', false), getSettingBool('auction_on', false), getSettingBool('staff_on', false), getSettingBool('namelock_on', true), getSettingBool('home_actions_on', true), getSettingBool('cats_on', true), getSettingBool('debates_on', true), getSettingBool('archive_autodelete_on', false), getAdLifetimeDays(), getAdRestoreFee(), getStrikeBanDays()]);
  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">الإعدادات</h1>
      </div>

      {saved === '1' && <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800"><Check className="h-4 w-4" /> تم الحفظ.</div>}

      <form action={saveSettingsAction} className="space-y-4 rounded-xl border border-primary/20 bg-card p-4">
        <div className="text-sm font-bold text-primary">مدة سماح العضو بالتعديل/الحذف على إعلانه</div>
        <p className="text-xs text-muted-foreground">حدّد المدة (بالساعات) التي يُسمح فيها للعضو بتعديل أو حذف إعلانه بعد نشره. اكتب 0 لجعلها دائمة بلا حد.</p>
        <label className="block space-y-1">
          <span className="text-sm font-medium">مدة السماح بالتعديل (ساعات)</span>
          <input name="editHours" type="number" min={0} defaultValue={w.editHours} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">مدة السماح بالحذف (ساعات)</span>
          <input name="deleteHours" type="number" min={0} defaultValue={w.deleteHours} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">مدة السماح بحذف الرسالة (دقائق)</span>
          <input name="msgDeleteMinutes" type="number" min={0} defaultValue={msgDeleteMin} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          <span className="block text-xs text-muted-foreground">خلالها يستطيع العضو حذف رسالته في المحادثة. 0 = دائماً.</span>
        </label>

        <div className="border-t border-primary/15 pt-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-primary"><BarChart3 className="h-4 w-4" /> إحصائيات الصفحة الرئيسية</div>
          <p className="mb-2 text-xs text-muted-foreground">اختر البطاقات التي تريد عرضها في الصفحة الرئيسية. إذا لم تختر أي بطاقة، لن يظهر أي شيء.</p>
          <div className="grid grid-cols-2 gap-2">
            {HOME_STAT_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-2 rounded-lg border border-primary/20 bg-white px-3 py-2 text-sm">
                <input type="checkbox" name={`stat_${k}`} defaultChecked={homeStats.has(k)} className="h-4 w-4 accent-primary" />
                {HOME_STAT_LABELS[k]}
              </label>
            ))}
          </div>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="checkbox" name="catsOn" defaultChecked={catsOn} className="mt-0.5 h-4 w-4 accent-primary" />
            <span><b>إظهار الأقسام في الموقع</b> — إلغاء التحديد يخفي الأقسام من كل مكان (الرئيسية، البحث، إضافة الإعلان، تفاصيل الإعلان، القوائم والأدلة). الإعلانات الجديدة أثناء الإخفاء تُسند داخلياً لقسم «عروض أخرى»، وأقسام الإعلانات القائمة لا تُمس إطلاقاً — إعادة التحديد تعيد كل شيء لمكانه فوراً.</span>
          </label>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="checkbox" name="homeActionsOn" defaultChecked={homeActionsOn} className="mt-0.5 h-4 w-4 accent-primary" />
            <span><b>أزرار تواصل الموقع تحت الإحصائيات</b> — صف أيقونات في الرئيسية: متابعة تربح، واتساب واتصال بالرقم الرسمي، ومشاركة الموقع.</span>
          </label>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="checkbox" name="debatesOn" defaultChecked={debatesOn} className="mt-0.5 h-4 w-4 accent-primary" />
            <span><b>إظهار المناقشات في الموقع</b> — إلغاء التحديد يخفي المناقشات من كل مكان (الشريط السفلي، القائمة الجانبية، تذييل الصفحة، وصفحات المناقشات نفسها). المناقشات القائمة لا تُحذف — إعادة التحديد تعيد كل شيء فوراً.</span>
          </label>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="checkbox" name="archiveAutodeleteOn" defaultChecked={archiveAutodeleteOn} className="mt-0.5 h-4 w-4 accent-primary" />
            <span><b>الحذف التلقائي للإعلانات المؤرشفة</b> — <b className="text-red-600">معطّل افتراضياً (الحذف يدوي)</b>؛ الإعلانات المؤرشفة تبقى محفوظة ولا تُحذف تلقائياً. عند تفعيله يُحذف نهائياً كل إعلان بقي مؤرشفاً أطول من <b>٦ أشهر</b> فقط (لتوفير المساحة). اتركه معطّلاً لحماية الإعلانات المستوردة القديمة، واحذف ما تريد يدوياً من تبويب «المؤرشفة».</span>
          </label>
        </div>

        {/* مفاتيح الميزات الحديثة — تفعيل/تعطيل من هنا مباشرة */}
        <div className="border-t border-primary/15 pt-3">
          <div className="mb-2 text-sm font-bold text-primary">الميزات التفاعلية</div>
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="pushOn" defaultChecked={pushOn} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><b>التنبيهات الفورية (Push)</b> — تصل الأعضاء على أجهزتهم فور وصول رسالة أو قرار توثيق/شحن. عند التفعيل تظهر بطاقة «التنبيهات الفورية» في لوحة كل عضو ليفعّلها على جهازه.</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="searchSuggestOn" defaultChecked={suggestOn} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><b>اقتراحات البحث</b> — عناوين مطابقة تظهر أثناء كتابة الزائر في صفحة البحث.</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="savedSearchOn" defaultChecked={savedSearchOn} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><b>تنبيهات البحث المحفوظ</b> — العضو يحفظ بحثه (حتى ١٠) وتصله رسالة تلقائية عند نشر إعلان مطابق.</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="matchNotifyOn" defaultChecked={matchNotifyOn} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><b>مطابقة عرض/طلب</b> — عند نشر «طلب» يصل تنبيه لأصحاب «العروض» في نفس القسم والمدينة (والعكس) — حتى ١٥ عضواً لكل إعلان.</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="storeReportOn" defaultChecked={storeReportOn} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><b>التقرير الشهري للمتاجر</b> — رسالة تلقائية لكل صاحب متجر أول كل شهر بزيارات متجره وتواصلاته الشهر الماضي (المتاجر بلا نشاط لا تُراسَل).</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="scheduleOn" defaultChecked={scheduleOn} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><b>جدولة النشر</b> — يحدد المعلن موعداً مستقبلياً (حتى ٣٠ يوماً) ويُنشر إعلانه تلقائياً وقتها. (لا تعمل مع وضع مراجعة الإعلانات).</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="bumpOn" defaultChecked={bumpOn} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><b>تحديث الإعلان (رفع للأعلى)</b> — زر «⬆ تحديث» في إعلانات العضو: مجاني كل عدة أيام ثم مدفوع (الأيام والسعر من الإيرادات ← التسعيرات).</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="adContactStatsOn" defaultChecked={adContactStatsOn} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><b>إحصاءات تواصل الإعلان</b> — عدّ ضغطات واتساب/الاتصال لكل إعلان وعرضها لصاحبه في «إعلاناتي».</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="couponsOn" defaultChecked={couponsOn} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><b>كوبونات المتجر</b> — كل متجر يضيف رموز خصم من لوحته وتظهر بارزة على واجهة متجره لعملائه.</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="stockOn" defaultChecked={stockOn} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><b>حالة توفر المنتج</b> — التاجر يحدد لكل منتج: متوفر / نفدت الكمية / طلب مسبق، وتظهر شارة الحالة على واجهة متجره.</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="hoursOn" defaultChecked={hoursOn} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><b>دوام المتجر</b> — المتجر يحدد ساعات وأيام عمله وتظهر شارة «مفتوح الآن / مغلق الآن» على واجهته (بتوقيت السعودية).</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="dealsOn" defaultChecked={dealsOn} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><b>عروض اليوم (التخفيضات)</b> — حقل «السعر قبل الخصم» في نموذج الإعلان، وصفحة /deals تجمع كل الإعلانات المخفّضة بنسبة الخصم (تشمل منتجات المتاجر المعتمدة لعرض إعلاناتها في تربح فقط).</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="autoRenewOn" defaultChecked={autoRenewOn} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><b>التجديد التلقائي لاشتراك المتاجر</b> — التاجر يفعّله من لوحته فيتجدد اشتراكه بآخر خطة دفعها خصماً من رصيده قبل الانتهاء بيوم، مع رسالة نجاح/تعذّر (لا يجدد ما تجاوز المهلة).</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="auctionOn" defaultChecked={auctionOn} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><b>المزادات 🔨</b> — العضو يفتح مزاداً على إعلانه (رسم الفتح من الإيرادات ← التسعيرات) ويزايد الأعضاء حتى الإغلاق التلقائي، ثم تصل رسالة للفائز والبائع لإتمام الصفقة. صفحة /auctions تظهر في القائمة عند التفعيل.</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="staffOn" defaultChecked={staffOn} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><b>موظفو المتجر 👥</b> — صاحب المتجر يضيف حتى 5 موظفين برقم الجوال، يظهر لكل موظف في «متجري» لوحة مصغّرة يضيف منها منتجات باسم المتجر فقط (بلا أي صلاحية أخرى).</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="nameLockOn" defaultChecked={nameLockOn} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><b>قفل اسم العضو 🔒</b> — العضو لا يغيّر اسمه بنفسه: يرسل طلباً بالاسم الجديد والسبب ومستند إثبات، وتراجعه الإدارة من «طلبات تغيير الاسم» (موافقة تُطبّق الاسم فوراً أو رفض بسبب — يصل العضو رسالة بالحالتين). عند إيقافه يعدّل العضو اسمه بحرّية.</span>
            </label>
          </div>
        </div>

        <div className="border-t border-primary/15 pt-3">
          <div className="mb-2 text-sm font-bold text-primary">نشر الإعلانات</div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="adsApproval" defaultChecked={adsApproval} className="h-4 w-4 accent-primary" />
            مراجعة الإعلانات قبل النشر (إذا فُعّلت، لا يُنشر الإعلان إلا بموافقة الإدارة)
          </label>
          <p className="mt-1 text-xs text-muted-foreground">افتراضياً يُنشر الإعلان مباشرة ما لم يكن مكرّراً.</p>

          {/* حساسية كشف التكرار — لكل حقل نسبته (العنوان/التفاصيل/الصور) */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <label className="block space-y-1">
              <span className="text-xs font-bold">تطابق العنوان %</span>
              <input name="dupTitlePct" type="number" min={50} max={100} defaultValue={dupThresholds.title} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold">تطابق التفاصيل %</span>
              <input name="dupDetailPct" type="number" min={50} max={100} defaultValue={dupThresholds.detail} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold">تطابق الصور %</span>
              <input name="dupImagePct" type="number" min={50} max={100} defaultValue={dupThresholds.image} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
            </label>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">يُعدّ الإعلان مكرّراً إذا تطابق <b>العنوان</b> أو <b>التفاصيل</b> أو <b>الصور</b> مع إعلان سابق للعضو نفسه — أو لعضو آخر — بالنسبة المحددة. مطابقة الصور إدراكية (تكشف نفس الصورة ولو صُغّرت أو أُعيد حفظها). كلما زادت النسبة قلّت الحساسية.</p>

          <label className="mt-3 block space-y-1">
            <span className="text-xs font-bold">مدة الحظر التلقائي عند تكرار المخالفات (بالأيام) — اكتب 0 للحظر الدائم</span>
            <input name="strikeBanDays" type="number" min={0} defaultValue={strikeBanDays} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </label>
          <p className="mt-1 text-xs text-muted-foreground">تُطبَّق عند بلوغ حدّ المخالفات: <b>٣ إنذارات</b> لتكرار الإعلانات ثم حظر، و<b>إنذاران</b> للمحتوى الممنوع (سياسي/مخدرات/أسلحة/جمعيات) ثم حظر — والمحتوى غير الأخلاقي يُحظر من أول مخالفة. لا تهاون في أي منها.</p>
        </div>

        <div className="border-t border-primary/15 pt-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-primary"><BarChart3 className="h-4 w-4" /> أرشفة الإعلانات</div>
          <label className="block space-y-1">
            <span className="text-sm"><b>أرشفة الإعلان تلقائياً بعد (بالأيام)</b> — اكتب 0 لتعطيل الأرشفة التلقائية</span>
            <input name="adLifetimeDays" type="number" min={0} defaultValue={adLifetimeDays} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
            <span className="block text-xs text-muted-foreground">بعد مرور هذه المدة على آخر نشاط للإعلان (النشر أو التحديث) يُؤرشف تلقائياً: يختفي عن العامة ويبقى ظاهراً لصاحبه في «إعلاناتي» فقط. لا يُحذف. (يُطبَّق على إعلانات الأعضاء لا المتاجر.)</span>
            <span className="mt-1 text-sm"><b>رسوم إعادة إظهار الإعلان المؤرشف (ر.س)</b> — اكتب 0 لتكون مجانية</span>
            <input name="adRestoreFee" type="number" min={0} defaultValue={adRestoreFee} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
            <span className="block text-xs text-muted-foreground">المبلغ الذي يُخصم من رصيد صاحب الإعلان عند ضغط «أعِد للظهور» ليعود إعلانه المؤرشف لمقدمة القوائم.</span>
          </label>
        </div>

        <div className="border-t border-primary/15 pt-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-primary"><BarChart3 className="h-4 w-4" /> الإعلانات المبوّبة</div>
          <label className="block space-y-1">
            <span className="text-sm">مدة بقاء الإعلان المبوّب (بالأيام) — اكتب 0 ليبقى دائماً</span>
            <input name="classifiedDays" type="number" min={0} defaultValue={classifiedDays} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
            <span className="text-sm">مدة تشغيل شاشة الدخول (بالثواني) — الافتراضي 5</span>
            <input name="splashSeconds" type="number" min={2} max={60} defaultValue={splashSeconds} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </label>

          {/* منع تكرار الإعلانات المبوّبة — تفعيل + نِسب التطابق (محتوى/صورة/خلفية) */}
          <label className="mt-3 flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" name="cdupOn" defaultChecked={cdup.enabled} className="h-4 w-4 accent-[hsl(var(--primary))]" />
            منع تكرار الإعلانات المبوّبة (يمنع إعادة نشر نفس الإعلان)
          </label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <label className="block space-y-1">
              <span className="text-xs font-bold">تطابق المحتوى %</span>
              <input name="cdupContentPct" type="number" min={50} max={100} defaultValue={cdup.content} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold">تطابق الصورة %</span>
              <input name="cdupImagePct" type="number" min={50} max={100} defaultValue={cdup.image} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold">تطابق الخلفية %</span>
              <input name="cdupBgPct" type="number" min={50} max={100} defaultValue={cdup.background} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
            </label>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">يُعدّ المبوّب مكرّراً إذا تطابق <b>المحتوى</b> (العنوان+النص) أو <b>الصورة</b> (مطابقة إدراكية) مع مبوّب سابق للعضو نفسه بالنسبة المحددة. <b>الخلفية</b> (الثيم+النقشة+الزخرفة) تُحتسب مع تشابه المحتوى ٥٠٪+ فقط، حتى لا تُحجب إعلانات مختلفة تشترك في نفس التصميم. الخلفية ١٠٠٪ = تصميم مطابق تماماً.</p>
        </div>

        {/* التسعير والاشتراكات وأرصدة الأعضاء تُدار من صفحة مستقلة */}
        <div className="border-t border-primary/15 pt-3">
          <Link href="/admin/revenue" className="flex items-center justify-between gap-2 rounded-xl border-2 border-primary/20 bg-primary/5 p-3 text-sm font-bold text-primary hover:bg-primary/10">
            <span>💳 التسعيرات والاشتراكات وأرصدة الأعضاء</span>
            <span className="text-xs text-muted-foreground">إدارة الإيرادات ←</span>
          </Link>
        </div>

        {/* التطبيقات (أندرويد/آيفون): المتاجر والتحديث الإجباري */}
        <div className="card-3d rounded-xl p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-primary">📱 التطبيقات — التحديث الإجباري وروابط المتاجر</div>
          <p className="mb-2 text-xs text-muted-foreground">رفع «أدنى نسخة» يجبر كل النسخ الأقدم على التحديث فوراً (تُحجب بشاشة تحديث).</p>
          <label className="mb-2 block space-y-1">
            <span className="text-sm">اسم حزمة أندرويد (Package)</span>
            <input name="appAndroidPackage" dir="ltr" defaultValue={appCfg.android.package} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </label>
          <label className="mb-2 block space-y-1">
            <span className="text-sm">بصمة SHA-256 (من Play Console ← App integrity — تفعّل assetlinks)</span>
            <input name="appAndroidSha256" dir="ltr" defaultValue={appCfg.android.sha256} placeholder="AA:BB:CC:…" className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </label>
          <label className="mb-2 block space-y-1">
            <span className="text-sm">رابط التطبيق في Google Play</span>
            <input name="appAndroidStoreUrl" dir="ltr" defaultValue={appCfg.android.storeUrl} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </label>
          <label className="mb-2 block space-y-1">
            <span className="text-sm">أدنى نسخة أندرويد مسموحة (versionCode)</span>
            <input name="appAndroidMinCode" type="number" min={1} defaultValue={appCfg.android.minCode} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </label>
          <label className="mb-2 block space-y-1">
            <span className="text-sm">رابط التطبيق في App Store (آيفون)</span>
            <input name="appIosStoreUrl" dir="ltr" defaultValue={appCfg.ios.storeUrl} placeholder="https://apps.apple.com/app/…" className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </label>
          <label className="mb-2 block space-y-1">
            <span className="text-sm">أدنى نسخة آيفون مسموحة (Build)</span>
            <input name="appIosMinBuild" type="number" min={1} defaultValue={appCfg.ios.minBuild} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </label>
          <p className="mt-1 text-xs text-muted-foreground">بعد انتهاء المدة يختفي الإعلان المبوّب من العرض تلقائياً.</p>
        </div>

        <div className="border-t border-primary/15 pt-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-primary"><Eye className="h-4 w-4" /> إحصائيات الإعلانات المبوّبة (المشاهدات والنقرات)</div>
          <label className="block space-y-1">
            <span className="text-sm">من يستطيع رؤيتها؟</span>
            <select name="classifiedStats" defaultValue={statsAudience} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40">
              <option value="all">الجميع (كل من يشاهد الإعلان)</option>
              <option value="owner">صاحب الإعلان والإدارة فقط</option>
              <option value="admin">الإدارة فقط</option>
            </select>
          </label>
        </div>

        <Button>حفظ</Button>
      </form>
    </div>
  );
}
