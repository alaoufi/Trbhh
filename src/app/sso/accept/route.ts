import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSession } from '@/lib/auth';
import { ssoEnabled, verifyHandoff } from '@/lib/sso';
import { toLocalSaudi } from '@/lib/sms';
import { isUserBanned } from '@/lib/moderation';
import { toInt } from '@/lib/utils';

/**
 * استقبال تسليم الجلسة من الموقع النظير: /sso/accept?token=<jwt>&next=<path>
 * يتحقّق من الرمز، يجد الحساب محلياً بالجوال أو يُنشئ نسخة محلية له (مع مزامنة
 * بصمة كلمة المرور)، ثم يفتح جلسة محلية. الإداري/المدموج/المحظور لا يُقبل.
 */

/** إيجاد العضو بالجوال بأي صيغة مخزّنة (يطابق منطق الدخول الموحّد). */
async function findByPhone(local: string, raw: string) {
  let user = await prisma.users.findFirst({
    where: { OR: [{ phoneNumber: local }, { userName: local }, { phoneNumber: raw }] },
  });
  if (user) return user;
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 8) {
    let sig = digits.startsWith('966') ? digits.slice(3) : digits;
    sig = sig.replace(/^0+/, '');
    const forms = [sig, `0${sig}`, `966${sig}`, `00966${sig}`, `+966${sig}`];
    const rows = await prisma
      .$queryRawUnsafe<{ id: bigint }[]>(
        `SELECT id FROM users
         WHERE REPLACE(REPLACE(REPLACE(IFNULL(phoneNumber,''),' ',''),'-','') , '+','') IN (?,?,?,?,?)
         ORDER BY id LIMIT 1`,
        forms[0], forms[1], forms[2], forms[3], forms[4],
      )
      .catch(() => [] as { id: bigint }[]);
    if (rows[0]) user = await prisma.users.findUnique({ where: { id: rows[0].id } });
  }
  return user;
}

export async function GET(req: NextRequest) {
  const home = new URL('/', req.url);
  if (!ssoEnabled()) return NextResponse.redirect(home);

  const token = req.nextUrl.searchParams.get('token') || '';
  const nextRaw = req.nextUrl.searchParams.get('next') || '/';
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/';
  const dest = new URL(next, req.url);

  const claims = await verifyHandoff(token);
  if (!claims) return NextResponse.redirect(new URL('/login?sso=err', req.url));

  const local = toLocalSaudi(claims.phone) || claims.phone.trim();
  let user = await findByPhone(local, claims.phone.trim());

  if (user) {
    // أمان: الإداري لا يُفتح عن بُعد، والمدموج/المحظور يُوجَّه للدخول المباشر
    if (Number(user.is_admin) === 1 || String(user.type) === 'admin') {
      return NextResponse.redirect(new URL('/login', req.url));
    }
    if (user.merged_into && Number(user.merged_into) > 0) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
    if (await isUserBanned(toInt(user.id))) {
      return NextResponse.redirect(new URL('/login?banned=1', req.url));
    }
    // مزامنة بصمة كلمة المرور: أي تغيير على الموقع الآخر يسري هنا للدخول المباشر
    if (claims.pwhash && claims.pwhash !== user.password) {
      await prisma.users
        .update({ where: { id: user.id }, data: { password: claims.pwhash } })
        .catch(() => {});
    }
  } else {
    // إنشاء نسخة محلية للحساب (عضو عادي فقط — لا ترقية إدارية عبر SSO)
    user = await prisma.users.create({
      data: {
        name: claims.name || 'عضو',
        userName: local,
        phoneNumber: local,
        password: claims.pwhash, // بصمة bcrypt كما هي — الدخول المباشر بنفس كلمة المرور يعمل
        type: 'user',
        ban: 'no',
        trusted: 0,
        allow_phone: 1,
        whatsapp: 1,
        step: 0,
        forget: 0,
        is_admin: 0,
      },
    });
  }

  await createSession({ uid: toInt(user.id), name: user.name || user.userName || 'عضو', type: user.type });
  return NextResponse.redirect(dest);
}
