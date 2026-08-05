import { NextRequest, NextResponse } from 'next/server';
import { ssoEnabled, verifyServiceToken } from '@/lib/sso';
import { MATRIX_ROLES, getRolePermKeys, setRolePermKeys, type Role } from '@/lib/roles';

/**
 * إدارة صلاحيات هذه النشرة عن بُعد من الموقع الشقيق (تبويب «الموقع الآخر» في
 * لوحة الأدوار). قناة خادم-لخادم موقّعة بنطاق `roles` (لا يُعاد استخدام رمز
 * تحقّق الدخول هنا). كل نشرة تُطبّق صلاحياتها من قاعدتها هي؛ هذه النقطة تقرأ/
 * تكتب مصفوفة أدوار **هذه** النشرة فقط، فيحرّرها مدير الموقع الآخر من تبويبه.
 */
async function authed(req: NextRequest): Promise<boolean> {
  if (!ssoEnabled()) return false;
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return verifyServiceToken(bearer, 'roles');
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const roles: Record<string, string[]> = {};
  await Promise.all(MATRIX_ROLES.map(async (r) => { roles[r] = [...(await getRolePermKeys(r))]; }));
  return NextResponse.json({ ok: true, roles });
}

export async function POST(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ ok: false }, { status: 401 });
  let body: { role?: string; keys?: unknown };
  try {
    body = (await req.json()) as { role?: string; keys?: unknown };
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const role = String(body.role || '') as Role;
  if (!MATRIX_ROLES.includes(role)) return NextResponse.json({ ok: false }, { status: 400 });
  const keys = Array.isArray(body.keys) ? body.keys.map((k) => String(k)) : [];
  await setRolePermKeys(role, keys);
  return NextResponse.json({ ok: true });
}
