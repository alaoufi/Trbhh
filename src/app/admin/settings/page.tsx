import { Settings, Check } from 'lucide-react';
import { requireAction } from '@/lib/roles';
import { getMemberWindows } from '@/lib/settings';
import { Button } from '@/components/ui/button';
import { saveSettingsAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الإعدادات' };

export default async function AdminSettings({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireAction('users', 'edit');
  const [{ saved }, w] = await Promise.all([searchParams, getMemberWindows()]);
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
        <Button>حفظ</Button>
      </form>
    </div>
  );
}
