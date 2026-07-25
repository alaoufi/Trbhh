import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { UserRound, Store, Check, Pencil, Trash2, Plus, Star } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { getUserProfiles, getActiveProfile, type Profile } from '@/lib/profiles';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { addProfileAction, updateProfileAction, deleteProfileAction, switchProfileAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'هوياتي — حسابات ومتاجر' };

const PRESET_COLORS = ['#3287da', '#16a34a', '#db2777', '#9333ea', '#ea580c', '#0d9488', '#dc2626', '#4f46e5'];
const field = 'w-full rounded-lg border-2 border-primary/25 bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-primary/40';
const lbl = 'mb-1 block text-xs font-bold text-foreground/70';

function ProfileForm({ p }: { p?: Profile }) {
  const edit = !!p;
  return (
    <form action={edit ? updateProfileAction : addProfileAction} encType="multipart/form-data" className="space-y-3">
      {edit && <input type="hidden" name="profileId" value={p!.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={lbl}>الاسم الظاهر <span className="text-red-600">*</span></label>
          <input name="name" required defaultValue={p?.name || ''} maxLength={120} className={field} placeholder="مثال: أبو محمد / مؤسسة النور" />
        </div>
        <div>
          <label className={lbl}>المعرّف الظاهر (اختياري)</label>
          <input name="handle" defaultValue={p?.handle || ''} maxLength={32} className={field} placeholder="مثال: abu_mohammed" dir="ltr" />
        </div>
        <div>
          <label className={lbl}>جوال المراسلات</label>
          <input name="phone" type="tel" inputMode="tel" defaultValue={p?.phone || ''} maxLength={24} className={field} placeholder="05xxxxxxxx" dir="ltr" />
        </div>
        <div>
          <label className={lbl}>واتساب المراسلات</label>
          <input name="whatsapp" type="tel" inputMode="tel" defaultValue={p?.whatsapp || ''} maxLength={24} className={field} placeholder="05xxxxxxxx" dir="ltr" />
        </div>
        <div>
          <label className={lbl}>بريد المراسلات</label>
          <input name="email" type="email" defaultValue={p?.email || ''} maxLength={120} className={field} placeholder="name@example.com" dir="ltr" />
        </div>
        <div>
          <label className={lbl}>الصورة التعريفية</label>
          <input name="avatar" type="file" accept="image/*" className="w-full rounded-lg border-2 border-primary/25 bg-white p-1.5 text-xs file:mr-2 file:rounded file:border-0 file:bg-primary file:px-2 file:py-1 file:font-bold file:text-white" />
        </div>
      </div>
      <div>
        <label className={lbl}>لون الهوية (للتفريق البصري)</label>
        <div className="flex flex-wrap items-center gap-2">
          {PRESET_COLORS.map((c) => (
            <label key={c} className="relative cursor-pointer">
              <input type="radio" name="color" value={c} defaultChecked={p?.color === c} className="peer sr-only" />
              <span className="block h-7 w-7 rounded-full ring-2 ring-transparent ring-offset-2 peer-checked:ring-foreground" style={{ background: c }} />
            </label>
          ))}
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            مخصّص: <input type="color" name="color" defaultValue={p?.color || '#3287da'} className="h-7 w-9 cursor-pointer rounded border" />
          </label>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">اختر لوناً واحداً (المخصّص يتقدّم إن غيّرته).</p>
      </div>
      <button className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-white hover:opacity-90">
        {edit ? <><Check className="h-4 w-4" /> حفظ التعديلات</> : <><Plus className="h-4 w-4" /> إضافة الهوية</>}
      </button>
    </form>
  );
}

export default async function ProfilesPage({ searchParams }: { searchParams: Promise<{ error?: string; max?: string; added?: string; saved?: string; deleted?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const sp = await searchParams;
  const [profiles, active] = await Promise.all([getUserProfiles(session.uid), getActiveProfile(session.uid)]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <UserRound className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">هوياتي — حسابات ومتاجر</h1>
      </div>
      <p className="text-sm text-muted-foreground">دخول واحد، وعدّة هويات للنشر — كل هوية ببياناتها المستقلة (اسم/جوال/بريد/صورة/لون). اختر الهوية الفعّالة لتُعلن باسمها.</p>

      {sp.error === 'limit' && <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">بلغت الحد الأقصى لعدد الهويات الشخصية{sp.max ? ` (${sp.max})` : ''}.</div>}
      {sp.error === 'handle' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">المعرّف الظاهر مستخدم مسبقاً — اختر غيره.</div>}
      {sp.error === 'name' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">الاسم الظاهر مطلوب.</div>}
      {(sp.added || sp.saved || sp.deleted) && <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ تم الحفظ.</div>}

      {/* الهوية الفعّالة */}
      <div className="rounded-2xl border-2 p-4" style={{ borderColor: active.color || 'hsl(var(--primary))', background: `${active.color || '#3287da'}14` }}>
        <div className="text-xs font-bold text-muted-foreground">الهوية الفعّالة الآن — تُعلن باسم:</div>
        <div className="mt-1 flex items-center gap-3">
          <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full ring-2" style={{ '--tw-ring-color': active.color || '#3287da' } as React.CSSProperties}>
            <Image src={active.avatarUrl} alt={active.name} fill sizes="48px" className="object-cover" />
          </span>
          <div>
            <div className="flex items-center gap-1.5 font-extrabold" style={{ color: active.color || undefined }}>
              {active.type === 'store' ? <Store className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
              {active.name}
              {active.isDefault && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">افتراضي</span>}
            </div>
            {active.handle && <div className="text-xs text-muted-foreground" dir="ltr">@{active.handle}</div>}
          </div>
        </div>
      </div>

      {/* قائمة الهويات */}
      <div className="space-y-3">
        <h2 className="text-sm font-extrabold text-foreground/80">كل هوياتك ({profiles.length})</h2>
        {profiles.map((p) => (
          <div key={p.id} className="card-3d rounded-xl p-3" style={{ borderInlineStart: `4px solid ${p.color || '#cbd5e1'}` }}>
            <div className="flex items-center gap-3">
              <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-muted">
                <Image src={p.avatarUrl} alt={p.name} fill sizes="44px" className="object-cover" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-bold">
                  {p.type === 'store' ? <Store className="h-4 w-4 text-primary" /> : <UserRound className="h-4 w-4 text-primary" />}
                  <span className="truncate">{p.name}</span>
                  {p.isDefault && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                  {active.id === p.id && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">فعّالة</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.type === 'store' ? 'متجر' : 'حساب شخصي'}
                  {p.phone ? ` • 📱 ${p.phone}` : ''}{p.handle ? ` • @${p.handle}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                {active.id !== p.id && (
                  <form action={switchProfileAction}>
                    <input type="hidden" name="profileId" value={p.id} />
                    <input type="hidden" name="back" value="/account/profiles" />
                    <button className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-bold text-white hover:opacity-90"><Check className="h-3 w-3" /> تفعيل</button>
                  </form>
                )}
              </div>
            </div>
            {/* تعديل الهوية الشخصية (المتجر يُعدّل من إعدادات متجره) */}
            {p.type === 'personal' ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-bold text-primary"><Pencil className="mb-0.5 inline h-3 w-3" /> تعديل بيانات هذه الهوية</summary>
                <div className="mt-3 rounded-lg border border-primary/15 bg-primary/5 p-3">
                  <ProfileForm p={p} />
                  {!p.isDefault && (
                    <form action={deleteProfileAction} className="mt-3 border-t pt-2">
                      <input type="hidden" name="profileId" value={p.id} />
                      <ConfirmSubmit msg={`حذف الهوية «${p.name}»؟ إعلاناتها المنشورة تبقى كما هي.`} className="flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1 text-xs font-bold text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3 w-3" /> حذف الهوية
                      </ConfirmSubmit>
                    </form>
                  )}
                </div>
              </details>
            ) : (
              <div className="mt-2 text-xs text-muted-foreground">
                تُعدّل بيانات المتجر (الاسم/الشعار/التواصل) من <Link href="/store" className="font-bold text-primary underline">إدارة المتجر</Link>.
              </div>
            )}
          </div>
        ))}
      </div>

      {/* إضافة هوية جديدة */}
      <div className="card-3d rounded-2xl p-4">
        <h2 className="mb-3 flex items-center gap-1 text-sm font-extrabold text-primary"><Plus className="h-4 w-4" /> إضافة هوية شخصية جديدة</h2>
        <ProfileForm />
      </div>
    </div>
  );
}
