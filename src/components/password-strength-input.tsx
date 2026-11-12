'use client';
import { useState } from 'react';

/**
 * حقل كلمة مرور بمؤشّر قوة حيّ + رسالة تحذير عند الضعف. لا يمنع الحفظ (السياسة تسمح
 * بأي كلمة ٤ خانات فأكثر) — فقط يُعلم العضو بقوّتها وينبّهه إن كانت ضعيفة قبل الحفظ.
 */
const LEVELS = [
  { label: 'ضعيفة جداً', color: '#dc2626', width: '25%' },
  { label: 'ضعيفة', color: '#f59e0b', width: '50%' },
  { label: 'متوسطة', color: '#3287da', width: '75%' },
  { label: 'قوية', color: '#16a34a', width: '100%' },
];

function strengthLevel(pw: string): number {
  const len = [...pw].length;
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9\s]/].filter((r) => r.test(pw)).length;
  if (len >= 10 && variety >= 3) return 3;
  if (len >= 8 && variety >= 2) return 2;
  if (len >= 6 && variety >= 2) return 1;
  return 0;
}

export function PasswordStrengthInput({
  name = 'password', required, minLength = 4, placeholder, className, id, autoComplete = 'new-password',
}: {
  name?: string; required?: boolean; minLength?: number; placeholder?: string; className?: string; id?: string; autoComplete?: string;
}) {
  const [pw, setPw] = useState('');
  const len = [...pw].length;
  const level = strengthLevel(pw);
  const weak = len > 0 && level <= 1;
  return (
    <div className="space-y-1.5">
      <input
        id={id} name={name} type="password" required={required} minLength={minLength}
        placeholder={placeholder} className={className} autoComplete={autoComplete}
        value={pw} onChange={(e) => setPw(e.target.value)}
      />
      {len > 0 && (
        <>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full transition-all" style={{ width: LEVELS[level].width, background: LEVELS[level].color }} />
          </div>
          <p className="text-[11px] font-bold" style={{ color: LEVELS[level].color }}>قوة كلمة المرور: {LEVELS[level].label}</p>
          {weak && (
            <p className="rounded-lg bg-amber-50 p-2 text-[11px] font-bold text-amber-800">
              ⚠ كلمة مرور ضعيفة — يمكنك الحفظ والمتابعة، لكن حسابك سيكون أسهل اختراقاً. ننصح بزيادة الطول وإضافة أحرف وأرقام ورموز.
            </p>
          )}
        </>
      )}
    </div>
  );
}
