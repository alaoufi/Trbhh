import { createRoot } from 'react-dom/client';
import type { ComponentProps } from 'react';
import { AccessControlWorkspace } from '@/components/access-control';

type Props = ComponentProps<typeof AccessControlWorkspace>;
const params = new URLSearchParams(window.location.search);
const mode = params.get('mode') || 'manage';
// Every name, identity and audit value here is synthetic. No server modules are imported.
const data: Props['data'] = {
  ready: mode !== 'uninitialized',
  departments: [
    { id: 'support', name: 'خدمة العملاء · تجريبي', active: true },
    { id: 'finance', name: 'المراجعة المالية · تجريبي', active: true },
    { id: 'paused', name: 'قسم متوقف · تجريبي', active: false },
  ],
  roles: [
    { id: 'support-reader', name: 'مراجع إعلانات · تجريبي', departmentId: 'support', active: true, permissions: ['ads:view', 'ads:approve', 'users:view'], userCount: 2 },
    { id: 'support-editor', name: 'محرر محتوى · تجريبي', departmentId: 'support', active: true, permissions: ['ads:view', 'classified:edit', 'classified:view'], userCount: 1 },
    { id: 'finance-reader', name: 'قارئ مالي · تجريبي', departmentId: 'finance', active: true, permissions: ['finance:view', 'settlements:view', 'invoices:view'], userCount: 1 },
    { id: 'disabled-role', name: 'دور متوقف · تجريبي', departmentId: 'support', active: false, permissions: ['orders:refund'], userCount: 1 },
    { id: 'disabled-department', name: 'دور بقسم متوقف · تجريبي', departmentId: 'paused', active: true, permissions: ['finance:export'], userCount: 1 },
  ],
  users: [
    { id: 9001, name: 'موظف اختبار أول', userName: 'fixture-one', phone: null, enabled: true },
    { id: 9002, name: 'موظفة اختبار ثانية', userName: 'fixture-two', phone: null, enabled: true },
    { id: 9003, name: 'حساب اختبار متوقف', userName: 'fixture-disabled', phone: null, enabled: false },
  ],
  assignments: [
    { userId: 9001, roleIds: ['support-reader', 'support-editor', 'disabled-role', 'disabled-department'] },
    { userId: 9002, roleIds: ['finance-reader'] },
    { userId: 9003, roleIds: ['support-reader'] },
  ],
  audit: [
    { id: 'fixture-audit-1', at: '2026-09-22T10:15:00.000Z', actorId: 9999, action: 'user.roles', target: 'user:9001', reason: 'مثال توضيحي لإسناد دورين ومراجعة اتحاد الصلاحيات', before: { roleIds: ['support-reader'] }, after: { roleIds: ['support-reader', 'support-editor'] }, ip: '127.0.0.1', sessionFingerprint: 'fixture-session-reference-only' },
    { id: 'fixture-audit-2', at: '2026-09-22T09:00:00.000Z', actorId: 9999, action: 'role.save', target: 'role:finance-reader', reason: 'مثال توضيحي لدور مشاهدة دون اعتماد أو تصدير', before: null, after: { permissions: ['finance:view', 'settlements:view', 'invoices:view'] }, ip: '127.0.0.1', sessionFingerprint: 'fixture-session-reference-only' },
  ],
};
const q = params.get('q') || '';
if (q) data.users = data.users.filter(user => `${user.name} ${user.userName} ${user.id}`.includes(q));
const noop = async () => {};
// Stop all forms at capture phase before React can invoke even a local stub.
document.addEventListener('submit', event => {
  event.preventDefault(); event.stopImmediatePropagation();
  const notice = document.getElementById('fixture-notice');
  if (notice) notice.textContent = 'معاينة محلية ببيانات اختبار فقط · تم منع الإرسال · لم يُحفظ أي تغيير';
}, true);
createRoot(document.getElementById('fixture-root')!).render(<AccessControlWorkspace data={data} currentUserId={9999} canManage={mode !== 'readonly'} section={params.get('section') || 'roles'} selectedUserId={Number(params.get('userId')) || undefined} q={q} notice="" saveDepartmentAction={noop} saveRoleAction={noop} assignAction={noop} />);
