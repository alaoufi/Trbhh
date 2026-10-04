import React from 'react';
import {createRoot} from 'react-dom/client';
import {GuideBook} from '../../src/components/guide-book';
const sections=[
 {id:'category-admin-hub',title:'الأقسام وحقولها — الدليل المبسط',goal:'تحكم في أقسام الموقع وحقول الإعلانات من مكان واضح، دون تغيير البيانات السابقة.',steps:['افتح «الأقسام وحقولها» من القائمة الجانبية، ثم اختر الصفحة المناسبة: الأقسام، حقول الإعلانات، أو التحكم بالحقول.','اختر القسم الرئيسي ثم القسم الفرعي. حدّد الحقل المطلوب وعدّل الإلزام إلى إجباري أو اختياري.','راجع التغييرات ثم اضغط حفظ. إخفاء قسم لا يحذف الإعلانات السابقة.'],links:[{href:'/admin/help',label:'المساعدة واللقطات التوضيحية'},{href:'/admin/categories',label:'إدارة الأقسام'}],images:[{src:'/help/categories/manage.webp',alt:'إدارة الأقسام — بيانات تعليمية'}]},
 {id:'wallet',title:'الرصيد والباقات',goal:'معرفة الرصيد المتاح قبل النشر.',steps:['افتح المحفظة لمراجعة الرصيد والباقات. لا يعني شحن الرصيد تفعيل الاشتراك تلقائيًا.']},
 {id:'report-contact',title:'البلاغات والتواصل',goal:'متابعة الاستفسارات بخصوصية.',steps:['اختر البلاغ ثم اكتب ردك وأرسله. محادثة الطرف الآخر مستقلة.']}
];
createRoot(document.getElementById('root')!).render(<GuideBook topId="admin-guide-top" title="دليل الإدارة" subtitle="كتابك العملي لإدارة تربح — ابحث عن المهمة وانتقل مباشرة إلى شرحها." sections={sections}><p>اختر موضوعًا من الفهرس، أو استخدم البحث داخل الشرح.</p></GuideBook>);
