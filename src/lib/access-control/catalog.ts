/** Shared, data-only registry. A database grant is valid only if registered here. */
export const DEPARTMENTS = [
  {id:'executive',name:'الإدارة العليا'}, {id:'finance',name:'المحاسبة والمالية'},
  {id:'tax',name:'الضرائب'}, {id:'supply',name:'الموردون والمنتجات'},
  {id:'sales',name:'الطلبات والمبيعات'}, {id:'shipping',name:'الشحن'},
  {id:'integrations',name:'المتاجر والتكاملات'}, {id:'support',name:'خدمة العملاء'},
  {id:'audit',name:'التدقيق والمراجعة'}, {id:'technical',name:'إدارة النظام التقنية'},
] as const;
export const ACTION_LABELS: Record<string,string> = {
  view:'عرض', create:'إنشاء', edit:'تعديل', delete:'حذف', approve:'اعتماد', export:'تصدير',
  refund:'مرتجع مالي', reconcile:'مطابقة', close_period:'إقفال الفترة', manage_settings:'إدارة الإعدادات',
  archive:'أرشفة', suspend:'تعطيل', ban:'حظر', authorize:'تفويض الربط', sync:'مزامنة',
};
export const MODULES = [
  {key:'dashboard',label:'اللوحة التنفيذية',departmentId:'executive',actions:['view']},
  {key:'search',label:'بحث الإدارة',departmentId:'executive',actions:['view']},
  {key:'finance',label:'التقارير والتدفق النقدي',departmentId:'finance',actions:['view','export']},
  {key:'settlements',label:'مستحقات وتسويات الموردين',departmentId:'finance',actions:['view','create','edit','approve','refund','export']},
  {key:'budget',label:'الميزانية',departmentId:'finance',actions:['view','edit','export']},
  {key:'expenses',label:'المصروفات',departmentId:'finance',actions:['view','create','delete','approve','refund','export']},
  {key:'invoices',label:'الفواتير والمستندات',departmentId:'finance',actions:['view','create','export','refund']},
  {key:'wallets',label:'أرصدة الأعضاء والخدمات',departmentId:'finance',actions:['view','create','edit','refund','export']},
  {key:'topups',label:'طلبات شحن الرصيد',departmentId:'finance',actions:['view','edit','approve','refund','delete']},
  {key:'payments',label:'بوابات وحسابات الدفع',departmentId:'finance',actions:['view','manage_settings']},
  {key:'tax',label:'الضريبة',departmentId:'tax',actions:['view','manage_settings','export']},
  {key:'suppliers',label:'بيانات الموردين',departmentId:'supply',actions:['view','create','edit','delete']},
  {key:'products',label:'الكتالوج والمنتجات',departmentId:'supply',actions:['view','create','edit','delete','approve','suspend','export','manage_settings']},
  {key:'categories',label:'تصنيفات السوق وحقولها',departmentId:'supply',actions:['view','create','edit','delete','suspend','manage_settings']},
  {key:'ads',label:'إعلانات الأعضاء',departmentId:'sales',actions:['view','approve','archive','delete']},
  {key:'smart_ads',label:'مختبر إعلانات الإدارة',departmentId:'sales',actions:['view','create','edit','delete']},
  {key:'classified',label:'الإعلانات المبوبة',departmentId:'sales',actions:['view','create','edit','delete','suspend']},
  {key:'duplicates',label:'الإعلانات المكررة',departmentId:'sales',actions:['view','delete']},
  {key:'orders',label:'الطلبات والمبيعات',departmentId:'sales',actions:['view','create','edit','refund','export']},
  {key:'promos',label:'الإعلانات الترويجية',departmentId:'sales',actions:['view','create','edit','approve','delete']},
  {key:'packages',label:'الباقات',departmentId:'sales',actions:['view','create','edit','delete']},
  {key:'pricing',label:'تسعير الخدمات',departmentId:'sales',actions:['view','manage_settings']},
  {key:'campaigns',label:'حملات ومكافآت الرصيد',departmentId:'sales',actions:['view','create','edit','delete']},
  {key:'shipping',label:'التجهيز والشحن والتتبع',departmentId:'shipping',actions:['view','edit','manage_settings']},
  {key:'stores',label:'المتاجر والاشتراكات',departmentId:'integrations',actions:['view','create','edit','approve','suspend','delete']},
  {key:'integrations',label:'الربط والتفويض والمزامنة',departmentId:'integrations',actions:['view','create','edit','delete','authorize','sync','manage_settings']},
  {key:'users',label:'الأعضاء',departmentId:'support',actions:['view','create','edit','delete','ban','approve']},
  {key:'verifications',label:'توثيق الأعضاء',departmentId:'support',actions:['view','edit','approve','delete']},
  {key:'reports',label:'البلاغات والمراجعة',departmentId:'support',actions:['view','edit','delete']},
  {key:'comments',label:'التعليقات والتقييمات',departmentId:'support',actions:['view','edit','delete']},
  {key:'messages',label:'مراسلات الدعم',departmentId:'support',actions:['view','create','edit','delete','archive']},
  {key:'notifications',label:'إشعارات الأعضاء',departmentId:'support',actions:['view','create','delete']},
  {key:'words',label:'حارس المحتوى والكلمات',departmentId:'support',actions:['view','create','edit','delete']},
  {key:'audit',label:'سجل التدقيق',departmentId:'audit',actions:['view','export']},
  {key:'reconciliation',label:'المطابقة المالية',departmentId:'audit',actions:['view','reconcile','export']},
  {key:'periods',label:'إقفال الشهر',departmentId:'audit',actions:['view','close_period']},
  {key:'archive',label:'الأرشيف',departmentId:'audit',actions:['view']},
  {key:'access_control',label:'الأقسام والأدوار والصلاحيات',departmentId:'technical',actions:['view','manage_settings']},
  {key:'security',label:'أمان الحسابات والمصادقة',departmentId:'technical',actions:['view','manage_settings']},
  {key:'settings',label:'إعدادات النظام',departmentId:'technical',actions:['view','manage_settings']},
  {key:'texts',label:'نصوص الواجهة',departmentId:'technical',actions:['view','edit']},
  {key:'errors',label:'الأخطاء التقنية',departmentId:'technical',actions:['view','delete']},
  {key:'backup',label:'النسخ الاحتياطي والاستعادة',departmentId:'technical',actions:['view','create','edit','delete','export']},
] as const;
export type AccessModule = typeof MODULES[number]['key'];
export type AccessAction = typeof MODULES[number]['actions'][number];
const financialModules = new Set(['finance','settlements','budget','expenses','invoices','wallets','topups','payments','tax','orders','reconciliation','audit']);
const sensitive = (module:string,action:string) => action==='refund' || action==='close_period'
  || (action==='approve' && ['settlements','expenses','topups'].includes(module))
  || (['tax','payments','products','security'].includes(module) && action==='manage_settings')
  || (module==='expenses' && action==='delete')
  || (module==='backup' && ['export','edit'].includes(action))
  || (action==='export' && financialModules.has(module));
export const PERMISSIONS = MODULES.flatMap(m=>m.actions.map(action=>({
  key:`${m.key}:${action}`, module:m.key, action, label:`${m.label} — ${ACTION_LABELS[action]}`,
  departmentId:m.departmentId, sensitive:sensitive(m.key,action),
})));
export const permissionKeySet:ReadonlySet<string> = new Set(PERMISSIONS.map(p=>p.key));
export const SENSITIVE_KEYS:ReadonlySet<string> = new Set(PERMISSIONS.filter(p=>p.sensitive).map(p=>p.key));

/** One-way migration only. No wildcard, role-name inference or runtime fallback. */
export function legacyPermission(key:string):string|null {
  const aliases:Record<string,string> = {
    'ads:suspend':'ads:archive',
    'commerce:view':'products:view','commerce:add':'products:create','commerce:edit':'products:edit','commerce:suspend':'products:suspend',
    'finance:edit':'budget:edit','finance:approve':'settlements:approve','finance:close':'periods:close_period',
  };
  const converted=Object.hasOwn(aliases,key)?aliases[key]:key.replace(/:add$/,':create');
  return permissionKeySet.has(converted)?converted:null;
}

/** Templates are empty of exceptional financial powers; assignments are explicit. */
export const DEFAULT_ROLES: {id:string;name:string;departmentId:string;permissions:string[]}[] = [
  {id:'system_access_admin',name:'مسؤول إدارة الصلاحيات',departmentId:'technical',permissions:PERMISSIONS.filter(p=>!p.sensitive).map(p=>p.key)},
  ...DEPARTMENTS.map(d=>({id:`department_${d.id}`,name:d.name,departmentId:d.id,permissions:PERMISSIONS.filter(p=>p.departmentId===d.id && !p.sensitive && p.action==='view').map(p=>p.key)})),
];

export const FINANCE_SECTION_MODULE:Record<string,AccessModule> = {
  overview:'finance','cashflow':'finance','month-end':'finance',suppliers:'settlements',settlements:'settlements',
  budget:'budget',expenses:'expenses',invoices:'invoices',tax:'tax',reconciliation:'reconciliation',close:'periods',ledger:'audit',
};
const exactPages:Record<string,AccessModule> = {
  '/admin':'dashboard','/admin/search':'search','/admin/guide':'dashboard','/admin/archive':'archive',
  '/admin/access-control':'access_control','/admin/roles':'access_control',
  '/admin/ads':'ads','/admin/classified':'classified','/admin/smart-ads':'smart_ads','/admin/duplicates':'duplicates',
  '/admin/categories':'categories','/admin/promos':'promos','/admin/promos/packages':'packages','/admin/packages':'packages',
  '/admin/suppliers':'suppliers','/admin/suppliers/onboarding':'suppliers','/admin/suppliers/catalog':'products',
  '/admin/suppliers/integrations':'integrations','/admin/suppliers/cj':'integrations',
  '/admin/commerce':'products','/admin/commerce/accounts':'settlements','/admin/stores':'stores','/admin/shipping':'shipping','/admin/orders':'orders',
  '/admin/users':'users','/admin/international-registrations':'users','/admin/links':'users','/admin/name-requests':'users',
  '/admin/verifications':'verifications','/admin/reports':'reports','/admin/moderation':'reports','/admin/ratings':'comments',
  '/admin/messages':'messages','/admin/notifs':'notifications','/admin/words':'words','/admin/guard-words':'words',
  '/admin/topups':'topups','/admin/payments':'payments','/admin/payments/private-topup':'payments','/admin/payments/sandbox':'payments',
  '/admin/settings':'settings','/admin/texts':'texts','/admin/security':'security','/admin/verification':'security',
  '/admin/audit':'audit','/admin/errors':'errors','/admin/integrity':'audit','/admin/backup':'backup',
};
export function pagePermission(href:string,query?:{section?:string;tab?:string}):string|null {
  if(!href.startsWith('/admin')||href.startsWith('//'))return null;
  const [rawPath,rawQuery]=href.split('?');
  const path=rawPath.replace(/\/$/,'')||'/';
  const params=new URLSearchParams(rawQuery?.split('#')[0]);
  let pageModule:AccessModule|undefined;
  if(path==='/admin/finance'){
    const section=query?.section??params.get('section')??'overview';
    pageModule=Object.hasOwn(FINANCE_SECTION_MODULE,section)?FINANCE_SECTION_MODULE[section]:undefined;
  }else if(path==='/admin/revenue'){
    const tab=query?.tab??params.get('tab')??'';
    const tabs:Record<string,AccessModule>={wallets:'wallets',balances:'wallets',accounts:'payments',payments:'payments',pricing:'pricing',packages:'packages','promo-packages':'promos',campaigns:'campaigns',expenses:'expenses'};
    pageModule=Object.hasOwn(tabs,tab)?tabs[tab]:'finance';
  }else if(/^\/admin\/finance\/invoices\/[^/]+$/.test(path))pageModule='invoices';
  else if(/^\/admin\/commerce\/orders\/[^/]+$/.test(path))pageModule='orders';
  else if(/^\/admin\/users\/[^/]+\/permissions$/.test(path))pageModule='access_control';
  else if(/^\/admin\/users\/[^/]+$/.test(path))pageModule='users';
  else if(Object.hasOwn(exactPages,path))pageModule=exactPages[path];
  return pageModule?`${pageModule}:view`:null;
}
export function canAccessPage(keys:ReadonlySet<string>,href:string):boolean {
  const permission=pagePermission(href);return permission!==null&&keys.has(permission);
}
