import Link from 'next/link';
import { KeyRound, Check, Lock, Building2, AlertTriangle } from 'lucide-react';
import {
  requireAction, SERVICES, MATRIX_ACTIONS, MATRIX_ROLES, MATRIX_LOCKED,
  ACTION_LABELS, ROLE_LABELS, getRolePermKeys, type Role,
} from '@/lib/roles';
import { ssoEnabled, peerOrigin, fetchPeerRoles } from '@/lib/sso';
import { SITE_ID, siteLabel } from '@/lib/deployment';
import { getPeerSite } from '@/lib/settings';
import { saveRolePermsAction, savePeerRolePermsAction } from '../actions';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الأدوار والصلاحيات' };

const ROLE_COLORS: Record<Role, string> = {
  manager: 'from-indigo-600 to-indigo-800',
  moderator: 'from-emerald-600 to-emerald-800',
  monitor: 'from-amber-500 to-amber-700',
  store_monitor: 'from-teal-600 to-teal-800',
  member: 'from-sky-600 to-sky-800',
  visitor: 'from-slate-500 to-slate-700',
};

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ saved?: string; site?: string }> }) {
  await requireAction('users', 'edit');
  const { saved, site } = await searchParams;

  // تبويب لكل موقع: هذا الموقع (قاعدته المحلية) + الموقع الآخر (عبر قناة SSO).
  // تبويب الموقع الآخر يظهر فقط عند تفعيل الدخول الموحّد ووجود نظير مضبوط.
  const peerAvailable = ssoEnabled() && !!peerOrigin();
  const peer = await getPeerSite().catch(() => ({ label: 'الموقع الآخر' } as { label: string }));
  const onPeer = peerAvailable && site === 'peer';
  const selfLabel = siteLabel(SITE_ID);
  const peerLabel = peer.label || 'الموقع الآخر';

  // مصدر الصلاحيات حسب التبويب
  const permsByRole = new Map<Role, Set<string>>();
  let peerUnreachable = false;
  if (onPeer) {
    const remote = await fetchPeerRoles();
    if (!remote) peerUnreachable = true;
    else for (const r of MATRIX_ROLES) permsByRole.set(r, new Set(remote[r] ?? []));
  } else {
    await Promise.all(MATRIX_ROLES.map(async (r) => permsByRole.set(r, await getRolePermKeys(r))));
  }

  const action = onPeer ? savePeerRolePermsAction : saveRolePermsAction;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-2">
        <KeyRound className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-extrabold text-primary">الأدوار والصلاحيات</h1>
      </div>

      {peerAvailable && (
        <div className="flex gap-2">
          <Link href="/admin/roles" className={`rounded-lg px-4 py-2 text-sm font-bold ${!onPeer ? 'bg-primary text-white' : 'bg-secondary/60 text-primary hover:bg-secondary'}`}>
            صلاحيات {selfLabel}
          </Link>
          <Link href="/admin/roles?site=peer" className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold ${onPeer ? 'bg-primary text-white' : 'bg-secondary/60 text-primary hover:bg-secondary'}`}>
            <Building2 className="h-4 w-4" /> صلاحيات {peerLabel}
          </Link>
        </div>
      )}

      <p className="text-sm font-bold text-muted-foreground">
        لكل دور حدّد ما يستطيع فعله في كل قسم: <b>عرض / إضافة / تعديل / حذف / تعطيل</b>. تُحفظ صلاحيات كل دور على حدة.
        {onPeer
          ? <><br />تُحرّر هنا صلاحيات <b className="text-primary">{peerLabel}</b> — كل موقع يُطبّق صلاحياته من قاعدته وحده (مستقلّان تماماً).</>
          : <><br />تعديل إعلان العضو <b className="text-red-700">مقفول دائماً</b> للطاقم حفاظاً على الخصوصية.</>}
      </p>

      {saved === 'err' && (
        <div className="flex items-center gap-2 rounded-lg border-2 border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800">
          <AlertTriangle className="h-4 w-4" /> تعذّر حفظ صلاحيات {peerLabel} — الموقع الآخر غير متصل. حاول مجدداً.
        </div>
      )}
      {saved && saved !== 'err' && (
        <div className="flex items-center gap-2 rounded-lg border-2 border-green-300 bg-green-50 p-3 text-sm font-bold text-green-800">
          <Check className="h-4 w-4" /> تم حفظ صلاحيات دور «{ROLE_LABELS[saved as Role] ?? saved}»{onPeer ? ` في ${peerLabel}` : ''}.
        </div>
      )}

      {onPeer && peerUnreachable ? (
        <div className="flex items-center gap-2 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          <AlertTriangle className="h-5 w-5 shrink-0" /> تعذّر الوصول إلى {peerLabel} الآن — تأكّد أنه متصل وأن الدخول الموحّد مضبوط، ثم أعد المحاولة.
        </div>
      ) : (
        MATRIX_ROLES.map((role) => {
          const on = permsByRole.get(role) ?? new Set<string>();
          return (
            <form key={role} action={action} className="overflow-hidden rounded-2xl border-2 border-primary/15 bg-white shadow-sm">
              <input type="hidden" name="role" value={role} />
              <div className={`flex items-center justify-between bg-gradient-to-br ${ROLE_COLORS[role]} p-3 text-white`}>
                <h2 className="font-extrabold drop-shadow">{ROLE_LABELS[role]}</h2>
                <ConfirmSubmit msg={onPeer ? `حفظ صلاحيات هذا الدور في ${peerLabel}؟` : 'حفظ صلاحيات هذا الدور؟ تُطبَّق فوراً على كل من يحمله.'} className="rounded-md bg-white/15 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/25">حفظ</ConfirmSubmit>
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
        })
      )}
    </div>
  );
}
