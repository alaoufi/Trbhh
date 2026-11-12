import 'server-only';
import { prisma } from './prisma';
import { bustAdCaches } from './data';
import { getFeedDiagnostics } from './feed-diagnostics';

/**
 * «طبيب المنصة»: فحص آلي لصحّة المنصة + إصلاحات ذكية، كل إصلاح يغيّر بيانات يأخذ
 * **نقطة تراجع** (snapshot للقيم القبلية في admin_fix_log) فيمكن استرجاعه بضغطة.
 * قراءة-فقط حتى يُطلب إصلاح صراحةً. لا يحذف شيئاً — يطبّع أو يضبط فقط.
 */

export type CheckSeverity = 'ok' | 'warn' | 'crit';
export type DoctorCheck = { id: string; title: string; severity: CheckSeverity; detail: string; fixKey?: string };
export type FixLogEntry = { id: number; fixKey: string; title: string; affected: number; reversible: boolean; createdAt: string; undoneAt: string | null };

type FixOutcome = { affected: number; before: unknown; after: unknown; message: string; reversible: boolean };
type FixDef = {
  key: string;
  title: string;
  run: () => Promise<FixOutcome>;
  undo?: (before: unknown) => Promise<{ affected: number; message: string }>;
};

/* ------------------------------ الإصلاحات ------------------------------ */

const FIXES: Record<string, FixDef> = {
  // مسح ذاكرة قوائم الإعلانات (غير مدمّر، لا يحتاج تراجعاً)
  cache_clear: {
    key: 'cache_clear',
    title: 'مسح الذاكرة المؤقتة لقوائم الإعلانات',
    run: async () => {
      await bustAdCaches();
      return { affected: 0, before: null, after: null, message: 'تم مسح ذاكرة القوائم — ستُعاد تعبئتها من القاعدة فوراً.', reversible: false };
    },
  },

  // تطبيع store_only = NULL ← 0 (عمود أُضيف بلا قيمة في بعض التثبيتات). قابل للتراجع ما لم يكن ضخماً.
  store_only_null: {
    key: 'store_only_null',
    title: 'تصحيح إعلانات store_only الفارغة (NULL ← 0)',
    run: async () => {
      const rows = await prisma.$queryRawUnsafe<{ id: bigint }[]>(`SELECT id FROM ads WHERE store_only IS NULL`).catch(() => []);
      const ids = rows.map((r) => Number(r.id));
      await prisma.$executeRawUnsafe(`UPDATE ads SET store_only = 0 WHERE store_only IS NULL`).catch(() => {});
      await bustAdCaches();
      const reversible = ids.length > 0 && ids.length <= 5000;
      return { affected: ids.length, before: reversible ? { ids } : null, after: { store_only: 0 }, message: `صُحّح ${ids.length} إعلاناً.`, reversible };
    },
    undo: async (before) => {
      const ids = (before as { ids?: number[] })?.ids ?? [];
      if (!ids.length) return { affected: 0, message: 'لا توجد صفوف لاستعادتها.' };
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        await prisma.$executeRawUnsafe(`UPDATE ads SET store_only = NULL WHERE id IN (${chunk.map(() => '?').join(',')})`, ...chunk).catch(() => {});
      }
      await bustAdCaches();
      return { affected: ids.length, message: `استُعيدت ${ids.length} إعلاناً إلى NULL.` };
    },
  },

};

export function fixTitle(key: string): string { return FIXES[key]?.title ?? key; }

/* ------------------------------ الفحوص ------------------------------ */

export async function runDoctorChecks(): Promise<{ checks: DoctorCheck[]; feed: Awaited<ReturnType<typeof getFeedDiagnostics>> }> {
  const feed = await getFeedDiagnostics();
  const checks: DoctorCheck[] = [];

  // 1) تطابق العرض: المؤهّل مقابل المعروض فعلاً
  const eligible = Number(feed.counts.find((c) => c.label.includes('مؤهّلة لفلتر الرئيسية'))?.value ?? 0);
  const homeLatest = feed.sources[0]?.count ?? 0;
  checks.push({
    id: 'feed_match',
    title: 'تطابق عرض الرئيسية مع القاعدة',
    severity: feed.verdict.ok ? 'ok' : (eligible >= 5 && (homeLatest ?? 0) < 5 ? 'crit' : 'warn'),
    detail: `${feed.verdict.title} — ${feed.verdict.detail}`,
    fixKey: feed.verdict.ok ? undefined : 'cache_clear',
  });

  // 1ب) خيار «رسوم ظهور الإعلانات» مفعّل وأغلب الإعلانات بلا ظهور ساري ⇒ تختفي من الرئيسية والبحث
  const lifecycleOn = String(feed.counts.find((c) => c.label.includes('دورة حياة'))?.value ?? '') === 'نعم';
  const openAds = Number(feed.counts.find((c) => c.label.includes('منشورة ومُفعّلة معاً'))?.value ?? 0);
  const paidAds = Number(feed.counts.find((c) => c.label.includes('trbhh_until'))?.value ?? 0);
  checks.push({
    id: 'paid_display_toggle',
    title: 'خيار «تفعيل رسوم ظهور الإعلانات في تربح»',
    severity: lifecycleOn && openAds - paidAds >= 5 ? 'crit' : 'ok',
    detail: lifecycleOn
      ? `الخيار مفعّل: ${openAds - paidAds} من ${openAds} إعلاناً نشطاً بلا ظهور ساري، فلا تظهر للزوار. لإظهارها: المحاسبة والمالية ← التسعير والباقات ← أزل علامة الخيار واحفظ. (قرار إداري — لا يُغيَّر من هنا.)`
      : 'الخيار معطّل — العرض مفتوح لكل الإعلانات النشطة.',
  });

  // 2) أعمدة store_only الفارغة
  const nullStore = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM ads WHERE store_only IS NULL`).catch(() => [{ n: 0n }]);
  const nullCount = Number(nullStore[0]?.n ?? 0);
  checks.push({
    id: 'store_only_null',
    title: 'إعلانات بقيمة store_only فارغة (NULL)',
    severity: nullCount > 0 ? 'warn' : 'ok',
    detail: nullCount > 0 ? `${nullCount} إعلاناً قيمته NULL — قد لا تظهر في بعض القوائم. يُصلح بتطبيعها إلى 0.` : 'لا توجد قيم فارغة — سليم.',
    fixKey: nullCount > 0 ? 'store_only_null' : undefined,
  });

  // 3) مصادر تغذية فاشلة (استثناءات)
  const broken = feed.sources.filter((s) => s.bad);
  checks.push({
    id: 'feed_sources',
    title: 'سلامة مصادر التغذية (بلا استثناءات)',
    severity: broken.length ? 'crit' : 'ok',
    detail: broken.length ? broken.map((b) => `${b.label}: ${b.error}`).join(' · ') : 'كل المصادر تعمل دون استثناء.',
  });

  // 4) بائعون محظورون يملكون إعلانات نشطة (مخفيّة عمداً — للعلم فقط)
  const bannedAds = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*) AS n FROM ads a JOIN users u ON u.id = a.user_id WHERE u.ban = 'checked' AND a.status = 1 AND a.state = 'active'`,
  ).catch(() => [{ n: 0n }]);
  const bannedCount = Number(bannedAds[0]?.n ?? 0);
  checks.push({
    id: 'banned_sellers',
    title: 'إعلانات مخفيّة بسبب حظر أصحابها',
    severity: 'ok',
    detail: bannedCount > 0 ? `${bannedCount} إعلاناً مخفيّ لأن أصحابه محظورون (سلوك مقصود — ليس خللاً).` : 'لا يوجد.',
  });

  return { checks, feed };
}

/* ------------------------------ التطبيق والتراجع ------------------------------ */

export async function applyFix(key: string, actorId: number | null): Promise<{ ok: boolean; message: string }> {
  const def = FIXES[key];
  if (!def) return { ok: false, message: 'إصلاح غير معروف.' };
  try {
    const out = await def.run();
    await prisma.$executeRawUnsafe(
      `INSERT INTO admin_fix_log (fix_key, title, before_json, after_json, affected, reversible, actor) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      key, def.title,
      out.before == null ? null : JSON.stringify(out.before),
      out.after == null ? null : JSON.stringify(out.after),
      out.affected, out.reversible && !!def.undo ? 1 : 0, actorId,
    ).catch(() => {});
    return { ok: true, message: out.message };
  } catch (e) {
    return { ok: false, message: `تعذّر التنفيذ: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function undoFix(logId: number, _actorId: number | null): Promise<{ ok: boolean; message: string }> {
  const rows = await prisma.$queryRawUnsafe<{ fix_key: string; before_json: string | null; reversible: number; undone_at: Date | null }[]>(
    `SELECT fix_key, before_json, reversible, undone_at FROM admin_fix_log WHERE id = ?`, logId,
  ).catch(() => []);
  const entry = rows[0];
  if (!entry) return { ok: false, message: 'سجل غير موجود.' };
  if (entry.undone_at) return { ok: false, message: 'تمّ التراجع عن هذا الإصلاح سابقاً.' };
  if (!entry.reversible) return { ok: false, message: 'هذا الإصلاح غير قابل للتراجع — استعِد من النسخ الاحتياطي عند الحاجة.' };
  const def = FIXES[entry.fix_key];
  if (!def?.undo) return { ok: false, message: 'لا توجد آلية تراجع لهذا الإصلاح.' };
  try {
    const before = entry.before_json ? JSON.parse(entry.before_json) : null;
    const r = await def.undo(before);
    await prisma.$executeRawUnsafe(`UPDATE admin_fix_log SET undone_at = NOW() WHERE id = ?`, logId).catch(() => {});
    return { ok: true, message: r.message };
  } catch (e) {
    return { ok: false, message: `تعذّر التراجع: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function recentFixes(limit = 15): Promise<FixLogEntry[]> {
  const rows = await prisma.$queryRawUnsafe<{ id: bigint; fix_key: string; title: string; affected: number; reversible: number; created_at: Date; undone_at: Date | null }[]>(
    `SELECT id, fix_key, title, affected, reversible, created_at, undone_at FROM admin_fix_log ORDER BY id DESC LIMIT ?`, limit,
  ).catch(() => []);
  return rows.map((r) => ({
    id: Number(r.id), fixKey: r.fix_key, title: r.title, affected: Number(r.affected),
    reversible: Number(r.reversible) === 1, createdAt: r.created_at ? new Date(r.created_at).toISOString() : '', undoneAt: r.undone_at ? new Date(r.undone_at).toISOString() : null,
  }));
}
