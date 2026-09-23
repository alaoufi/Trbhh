import 'server-only';
import type { AdminLogRow } from './audit';
import type { AccessModule } from './access-control/catalog';

/** Legacy rows lack a source column. Only exact, reviewed action labels are trusted. */
const groups: readonly { modules: readonly AccessModule[]; actions: readonly string[] }[] = [
  { modules: ['products'], actions: ['تعديل منتجات CJ'] },
  { modules: ['orders'], actions: ['تعديل طلبات CJ'] },
  { modules: ['shipping'], actions: ['تعديل شحن CJ'] },
  { modules: ['integrations'], actions: ['تعديل وكلاء CJ', 'إعدادات تكامل CJ'] },
  { modules: ['pricing'], actions: ['تسعير CJ'] },
  { modules: ['wallets'], actions: ['إضافة رصيد', 'خصم رصيد'] },
  { modules: ['pricing', 'wallets'], actions: ['إنشاء خدمة خاصة للمحفظة', 'إلغاء خدمة خاصة قبل القبول'] },
  { modules: ['topups'], actions: ['تأكيد شحن رصيد', 'تحقق مصرفي لطلب شحن إلكتروني', 'تحقق مصرفي جماعي لطلبات الشحن الإلكتروني', 'حذف طلبات دفع إلكتروني تجريبية', 'إلغاء تأكيد شحن', 'رفض شحن رصيد'] },
  { modules: ['expenses'], actions: ['إضافة مصروف', 'حذف مصروف'] },
  { modules: ['payments'], actions: ['إضافة حساب شحن', 'حفظ إعدادات الدفع الإلكتروني', 'تحديث تفعيل الدفع الإلكتروني', 'تحديث تفعيل الحوالات البنكية', 'حفظ مفاتيح مزوّد دفع'] },
  { modules: ['payments', 'topups'], actions: ['بدء شحن خاص بالراجحي', 'فشل بدء شحن خاص بالراجحي'] },
  { modules: ['stores', 'verifications', 'wallets'], actions: ['موافقة توثيق مدفوع', 'موافقة توثيق مدفوع (رصيد غير كافٍ)', 'رفض توثيق مدفوع', 'إلغاء توثيق مدفوع'] },
  { modules: ['users'], actions: ['موافقة تسجيل دولي', 'رفض تسجيل دولي', 'حظر عضو', 'رفع حظر', 'قبول تغيير اسم', 'رفض تغيير اسم', 'أرشفة عضو', 'حذف عضو فارغ'] },
  { modules: ['security', 'users'], actions: ['ربط حسابات أعضاء', 'فك ربط حساب عضو', 'فك ارتباط دخول موحّد'] },
  { modules: ['verifications'], actions: ['توثيق عضو (زر سريع)', 'إلغاء توثيق', 'قبول توثيق', 'رفض توثيق'] },
  { modules: ['stores'], actions: ['اعتماد متجر', 'رفض متجر', 'عرض متجر بالرئيسية (قرار إداري)', 'إيقاف نهائي لمتجر', 'إيقاف مؤقت لمتجر', 'إعادة تفعيل متجر', 'إنذار متجر', 'حذف متجر نهائياً من الأرشيف', 'اعتماد عرض منتجات متجر', 'رفض عرض منتجات متجر', 'تنفيذ نقل ملكية متجر', 'منح أيام مجانية لمتجر', 'قبول تعديل نشاط متجر', 'قبول اسم متجر', 'رفض تعديل نشاط متجر', 'رفض اسم متجر'] },
  { modules: ['comments'], actions: ['أرشفة تعليق', 'استعادة تعليق من الأرشيف'] },
  { modules: ['messages'], actions: ['أرشفة مراسلة إدارة', 'استعادة مراسلة إدارة', 'حذف نهائي لمراسلة إدارة مؤرشفة'] },
  { modules: ['messages', 'ads'], actions: ['رسالة لصاحب إعلان'] },
  { modules: ['messages', 'stores'], actions: ['رسالة رسمية لتاجر'] },
  { modules: ['ads'], actions: ['أرشفة إعلان (بدل الحذف المباشر)', 'حذف إعلان نهائياً من الأرشيف', 'حظر إعلان مخالف نهائياً (حذف لا رجعة فيه)', 'إعادة نشر إعلان متجر', 'أرشفة كل الإعلانات المنتظِرة'] },
  { modules: ['ads', 'stores'], actions: ['إخفاء إعلان متجر عن النشر + إنذار مخالفة'] },
  { modules: ['reports'], actions: ['معالجة بلاغ: حظر الناشر', 'معالجة بلاغ: حذف الإعلان', 'معالجة بلاغ: تجاهل البلاغ', 'فكّ حظر آلي بعد المراجعة', 'الإبقاء على حظر آلي بعد المراجعة', 'مسح سجل بلاغ من الأرشيف', 'مسح سطر من سجل الرصد الآلي (الأرشيف)'] },
  { modules: ['texts'], actions: ['تعديل النصوص'] },
  { modules: ['settings'], actions: ['تعديل الإعدادات'] },
  { modules: ['pricing'], actions: ['تعديل التسعيرات والعروض'] },
  { modules: ['notifications'], actions: ['حذف تنبيه', 'حذف التنبيهات المقروءة'] },
  { modules: ['errors'], actions: ['مسح سجل الأخطاء التقنية'] },
];
const sources = new Map(groups.flatMap(group => group.actions.map(action => [action, group.modules] as const)));

/** Keep safe audit metadata, never arbitrary action text, targets, notes, or future fields. */
export function redactAdminLog(rows: readonly AdminLogRow[], keys: ReadonlySet<string>): AdminLogRow[] {
  if (!keys.has('audit:view')) return [];
  return rows.map(row => {
    const modules = sources.get(row.action);
    const allowed = modules?.every(module => keys.has(`${module}:view`)) === true;
    return {
      id: row.id, adminId: row.adminId, adminName: row.adminName, at: row.at,
      action: modules ? row.action : 'إجراء إداري',
      target: allowed ? row.target : null, note: allowed ? row.note : null,
    };
  });
}
