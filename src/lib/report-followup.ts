import 'server-only';
import { prisma } from './prisma';
import { requireUser } from './auth';
import { hasAction } from './roles';
import { getSettingBool } from './settings';
import { ensureSchema } from '@/data/schema-sync';
import { isReadOnlyPreview } from './read-only-preview';
import { getPrimaryAdminId } from './admin-inbox';

export const REPORT_FOLLOWUP_ENABLED = 'report_followup_enabled';
export class ReportAccessError extends Error {}
export type ReportKind = 'ad' | 'general';
export function parseReportRef(kind: string, id: string): { kind: ReportKind; id: bigint } {
  if (!['ad', 'general'].includes(kind) || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new ReportAccessError('بلاغ غير متاح.');
  return { kind: kind as ReportKind, id: BigInt(id) };
}

async function authorizedReport(kind: string, id: string, admin: boolean, writing = false) {
  const ref = parseReportRef(kind, id);
  const session = await requireUser();
  if (admin && (!(await hasAction(session.uid, 'reports', 'view')) || (writing && !(await hasAction(session.uid, 'reports', 'add'))))) throw new ReportAccessError('بلاغ غير متاح.');
  await ensureSchema();
  const original = ref.kind === 'ad'
    ? await prisma.repord_ads.findUnique({ where: { id: ref.id } })
    : await prisma.reports.findUnique({ where: { id: ref.id } });
  if (!original || (!admin && Number(original.user_id) !== session.uid)) throw new ReportAccessError('بلاغ غير متاح.');
  return { ref, uid: session.uid, original, report: {
    ownerId: Number(original.user_id),
    body: 'comment' in original ? original.comment || 'بلاغ على إعلان' : original.message,
    title: 'ads_id' in original ? `بلاغ على إعلان #${original.ads_id}` : 'بلاغ موقع / عضو / محتوى',
  } };
}

/** Staff-only shortcut to the existing private chat; never copies report content. */
export async function getReportedMemberContact(kind: string, id: string): Promise<{ id: string } | null> {
  const { original, uid } = await authorizedReport(kind, id, true, true);
  if (!(await getSettingBool(REPORT_FOLLOWUP_ENABLED, true))) return null;
  let target: bigint | null = null;
  if ('ads_id' in original) {
    const ad = await prisma.ads.findUnique({ where: { id: BigInt(original.ads_id) }, select: { user_id: true } });
    target = ad?.user_id ?? null;
  } else {
    // Only the server-generated member-report prefix identifies a member.
    // Legacy comment_id may refer to content, not an account: never guess.
    const match = /^بلاغ عن عضو #([1-9]\d*) — /.exec(original.message);
    if (match && BigInt(match[1]) === original.comment_id) target = original.comment_id;
  }
  if (!target || target <= 0n || target === BigInt(uid) || target > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const member = await prisma.users.findUnique({ where: { id: target }, select: { id: true } });
  return member ? { id: String(member.id) } : null;
}

export async function getReportConversation(kind: string, id: string, admin = false) {
  const context = await authorizedReport(kind, id, admin);
  const replies = await prisma.report_replies.findMany({
    where: { report_kind: context.ref.kind, report_id: context.ref.id }, orderBy: { id: 'asc' },
  }).catch(error => {
    // A SELECT-only preview cannot provision the new additive table before release.
    if (isReadOnlyPreview() && error?.code === 'P2021') return [];
    throw error;
  });
  return { report: context.report, replies };
}

export async function replyToReport(kind: string, id: string, body: string, nonce: string, admin = false) {
  const text = body.trim();
  if (!text || text.length > 2000 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce)) throw new ReportAccessError('اكتب ردًا من حرف واحد إلى 2000 حرف ثم أعد المحاولة.');
  if (isReadOnlyPreview()) throw new ReportAccessError('هذه معاينة للقراءة فقط.');
  const context = await authorizedReport(kind, id, admin, true);
  if (!(await getSettingBool(REPORT_FOLLOWUP_ENABLED, true))) throw new ReportAccessError('الردود متوقفة مؤقتًا من الإدارة، ويمكنك قراءة المحادثة السابقة.');
  const recipient = admin ? context.report.ownerId : await getPrimaryAdminId();
  try {
    await prisma.$transaction(async tx => {
      await tx.report_replies.create({ data: {
        report_kind: context.ref.kind, report_id: context.ref.id, author_id: BigInt(context.uid),
        is_staff: admin, body: text, nonce,
      } });
      // A staff reply handles the alert, not the conversation. A later member
      // follow-up reopens only this reply state, never a final moderation decision.
      if (context.ref.kind === 'ad') {
        if (admin) await tx.repord_ads.updateMany({
          where: { id: context.ref.id, status: 0 },
          data: { status: 1, action: 'reply', handled_at: new Date(), handled_by: BigInt(context.uid) },
        });
        else await tx.repord_ads.updateMany({
          where: { id: context.ref.id, status: 1, action: 'reply' },
          data: { status: 0, action: null, handled_at: null, handled_by: null },
        });
      }
      if (recipient && recipient !== context.uid) await tx.notfications.create({ data: {
        user_id: String(recipient), type: 'other', title: admin ? 'رد جديد من الإدارة على بلاغك' : 'متابعة جديدة من صاحب بلاغ',
        route: `${admin ? '/account/submitted-reports' : '/admin/reports'}/${context.ref.kind}/${id}`, model_id: 0,
        created_at: new Date(), updated_at: new Date(),
      } });
    });
  } catch (error) {
    // Same browser submission retried: the first transaction already saved and notified.
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')) throw error;
  }
}
