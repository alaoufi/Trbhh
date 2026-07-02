import { KeyRound, Check, Lock } from 'lucide-react';
import {
  requireAction, SERVICES, MATRIX_ACTIONS, MATRIX_ROLES, MATRIX_LOCKED,
  ACTION_LABELS, ROLE_LABELS, getRolePermKeys, type Role,
} from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { saveRolePermsAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الأدوار والصلاحيات' };

const ROLE_COLORS: Record<Role, string> = {
  manager: 'from-indigo-600 to-indigo-800',
  moderator: 'from-emerald-600 to-emerald-800',
  monitor: 'from-amber-500 to-amber-700',
  member: 'from-sky-600 to-sky-800',
  visitor: 'from-slate-500 to-slate-700',
};

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireAction('users', 'edit');
  const { saved } = await searchParams;
  const permsByRole = new Map<Role, Set<string>>();
  await Promise.all(MATRIX_ROLES.map(async (r) => permsByRole.set(r, await getRolePermKeys(r))));

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-2">
        <KeyRound className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-extrabold text-primary">الأدوار والصلاحيات</h1>
      </div>
      <p className="text-sm font-bold text-muted-foreground">
        لكل دور حدّد ما يستطيع فعله في كل قسم: <b>عرض / إضافة / تعديل / حذف / تعطيل</b>. تُحفظ صلاحيات كل دور على حدة.
        <br />تعديل إعلان العضو <b className="text-red-700">مقفول دائماً</b> للطاقم حفاظاً على الخصوصية.
      </p>

      {saved && (
        <div className="flex items-center gap-2 rounded-lg border-2 border-green-300 bg-green-50 p-3 text-sm font-bold text-green-800">
          <Check className="h-4 w-4" /> تم حفظ صلاحيات دور «{ROLE_LABELS[saved as Role] ?? saved}».
        </div>
      )}

      {MATRIX_ROLES.map((role) => {
        const on = permsByRole.get(role) ?? new Set<string>();
        return (
          <form key={role} action={saveRolePermsAction} className="overflow-hidden rounded-2xl border-2 border-primary/15 bg-white shadow-sm">
            <input type="hidden" name="role" value={role} />
            <div className={`flex items-center justify-between bg-gradient-to-br ${ROLE_COLORS[role]} p-3 text-white`}>
              <h2 className="font-extrabold drop-shadow">{ROLE_LABELS[role]}</h2>
              <Button size="sm" className="bg-white/15 hover:bg-white/25">حفظ</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-center text-sm">
                <thead>
                  <tr className="bg-secondary/60 text-primary">
                    <th className="p-2 text-right font-extrabold">القسم</th>
                    {MATRIX_ACTIONS.map((a) => (
                      <th key={a} className="p-2 font-extrabold">{ACTION_LABELS[a]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SERVICES.map((s) => (
                    <tr key={s.key} className="border-t">
                      <td className="p-2 text-right font-bold">{s.label}</td>
                      {MATRIX_ACTIONS.map((a) => {
                        const k = `${s.key}:${a}`;
                        const locked = MATRIX_LOCKED.has(k);
                        return (
                          <td key={a} className="p-2">
                            {locked ? (
                              <Lock className="mx-auto h-4 w-4 text-muted-foreground/50" />
                            ) : (
                              <input
                                type="checkbox"
                                name="k"
                                value={k}
                                defaultChecked={on.has(k)}
                                className="h-4 w-4 accent-primary"
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </form>
        );
      })}
    </div>
  );
}
