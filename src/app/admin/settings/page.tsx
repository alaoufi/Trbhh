import { Settings, Check, BarChart3, Eye } from 'lucide-react';
import { requireAction } from '@/lib/roles';
import { getMemberWindows, getSettingBool, getClassifiedStatsAudience, getClassifiedLifetimeDays, getHomeStats, HOME_STAT_KEYS, HOME_STAT_LABELS, SETTING_ADS_APPROVAL } from '@/lib/settings';
import { Button } from '@/components/ui/button';
import { saveSettingsAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الإعدادات' };

export default async function AdminSettings({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireAction('users', 'edit');
  const [{ saved }, w, homeStats, statsAudience, classifiedDays, adsApproval] = await Promise.all([searchParams, getMemberWindows(), getHomeStats(), getClassifiedStatsAudience(), getClassifiedLifetimeDays(), getSettingBool(SETTING_ADS_APPROVAL, false)]);
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
        </div>

        <div className="border-t border-primary/15 pt-3">
          <div className="mb-2 text-sm font-bold text-primary">نشر الإعلانات</div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="adsApproval" defaultChecked={adsApproval} className="h-4 w-4 accent-primary" />
            مراجعة الإعلانات قبل النشر (إذا فُعّلت، لا يُنشر الإعلان إلا بموافقة الإدارة)
          </label>
          <p className="mt-1 text-xs text-muted-foreground">افتراضياً يُنشر الإعلان مباشرة ما لم يكن مكرّراً.</p>
        </div>

        <div className="border-t border-primary/15 pt-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-primary"><BarChart3 className="h-4 w-4" /> الإعلانات المبوّبة</div>
          <label className="block space-y-1">
            <span className="text-sm">مدة بقاء الإعلان المبوّب (بالأيام) — اكتب 0 ليبقى دائماً</span>
            <input name="classifiedDays" type="number" min={0} defaultValue={classifiedDays} className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
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
