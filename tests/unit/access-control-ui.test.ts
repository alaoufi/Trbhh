import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {AccessControlWorkspace} from '@/components/access-control';
import {PERMISSIONS} from '@/lib/access-control/catalog';
type Props=React.ComponentProps<typeof AccessControlWorkspace>;
const noop=async()=>{};
function props():Props{return {currentUserId:1,canManage:true,q:'',section:'roles',notice:'',saveDepartmentAction:noop,saveRoleAction:noop,assignAction:noop,data:{ready:true,departments:[{id:'support',name:'Support',active:true},{id:'finance',name:'Finance',active:false}],roles:[],assignments:[],users:[],audit:[]}};}
function render(p:Props){return renderToStaticMarkup(React.createElement(AccessControlWorkspace,p));}
function inputs(html:string){return html.match(/<input\b[^>]*>/g)??[];}
function buttons(html:string){return html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)??[];}
describe('access management rendered safety affordances',()=>{
  it('a new role starts without any permission including sensitive capabilities',()=>{
    const html=render(props()),checkboxes=inputs(html).filter(tag=>tag.includes('type="checkbox"')&&!tag.includes('name="active"'));
    expect(checkboxes).toHaveLength(PERMISSIONS.length);
    expect(checkboxes.every(tag=>!tag.includes('checked'))).toBe(true);
    expect(inputs(html).filter(tag=>tag.includes('name="permissions"'))).toHaveLength(0);
    expect(html).toContain('0 محددة');expect(html).toContain('يبدأ دون صلاحيات');
  });
  it('multiple assigned roles preview a deduplicated union, excluding disabled roles and departments',()=>{
    const p=props();p.section='users';p.selectedUserId=5;
    p.data.users=[{id:5,name:'Staff',userName:'staff',phone:null,enabled:true}];
    p.data.roles=[
      {id:'first',name:'First',departmentId:'support',active:true,permissions:['ads:view','users:view'],userCount:1},
      {id:'second',name:'Second',departmentId:'support',active:true,permissions:['ads:view'],userCount:1},
      {id:'disabled',name:'Disabled role',departmentId:'support',active:false,permissions:['orders:refund'],userCount:1},
      {id:'inactive_department',name:'Disabled department',departmentId:'finance',active:true,permissions:['finance:export'],userCount:1},
    ];
    p.data.assignments=[{userId:5,roleIds:p.data.roles.map(r=>r.id)}];
    const html=render(p),selected=inputs(html).filter(tag=>tag.includes('name="roleIds"')&&tag.includes('checked'));
    expect(selected).toHaveLength(4);expect(html).toContain('4 أدوار · 2 صلاحيات فعلية');
    const preview=html.slice(html.indexOf('معاينة الوصول الفعلي قبل الحفظ'),html.indexOf('تُراجع صلاحيتك'));
    expect(preview).toContain('إعلانات الأعضاء');expect(preview).toContain('الأعضاء');expect(preview).not.toContain('مرتجع مالي');expect(preview).not.toContain('تصدير');
  });
  it.each([false,true])('view-only role inspection disables every mutation control (schema ready=%s)',ready=>{
    const p=props();p.canManage=false;p.data.ready=ready;p.data.roles=[{id:'reader',name:'Read-only fixture',departmentId:'support',active:true,permissions:['ads:view'],userCount:1}];
    const html=render(p);
    expect(html).toContain('عرض فقط');expect(html).not.toContain('إنشاء دور جديد');
    expect(html).toContain('<fieldset disabled=""');expect(buttons(html).every(tag=>tag.includes('disabled=""'))).toBe(true);
    expect(inputs(html).filter(tag=>tag.includes('type="checkbox"')&&!tag.includes('name="active"')).every(tag=>tag.includes('disabled=""'))).toBe(true);
  });
  it('even an authorized manager cannot edit until explicit initialization',()=>{
    const p=props();p.data.ready=false;p.section='departments';
    const html=render(p);expect(html).toContain('جميع عمليات التغيير معطلة');expect(html).not.toContain('إنشاء القسم');expect(buttons(html).every(tag=>tag.includes('disabled=""'))).toBe(true);
  });
  it('audit values are escaped as text and show original metadata',()=>{
    const p=props();p.section='audit';p.data.audit=[{id:'8',at:'2026-09-22T12:00:00.000Z',actorId:null,action:'initialize',target:'<script>target()</script>',reason:'<img src=x onerror=run()>',before:{value:'<script>before()</script>'},after:{value:'<script>after()</script>'},ip:'127.0.0.1',sessionFingerprint:'a'.repeat(64)}];
    const html=render(p);expect(html).not.toContain('<script>');expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;before()&lt;/script&gt;');expect(html).toContain('&lt;script&gt;after()&lt;/script&gt;');expect(html).toContain('&lt;img src=x onerror=run()&gt;');expect(html).toContain('127.0.0.1');expect(html).toContain('a'.repeat(64));
    expect(html).toContain('ترحيل النظام');expect(html).toContain('تهيئة إدارة الوصول');
  });
  it('a disabled account previews zero access and allows only removing existing assignments',()=>{
    const p=props();p.section='users';p.selectedUserId=5;
    p.data.users=[{id:5,name:'Disabled staff',userName:'disabled',phone:null,enabled:false}];
    p.data.roles=[{id:'assigned',name:'Assigned',departmentId:'support',active:true,permissions:['ads:view'],userCount:1},{id:'unassigned',name:'Unassigned',departmentId:'support',active:true,permissions:['users:view'],userCount:0}];
    p.data.assignments=[{userId:5,roleIds:['assigned']}];
    const html=render(p),tags=inputs(html);
    expect(html).toContain('0 صلاحيات فعلية');
    expect(tags.find(tag=>tag.includes('value="assigned"'))).toContain('checked');
    expect(tags.find(tag=>tag.includes('value="assigned"'))).not.toContain('disabled');
    expect(tags.find(tag=>tag.includes('value="unassigned"'))).toContain('disabled');
    expect(buttons(html).find(tag=>tag.includes('حفظ أدوار الموظف'))).toContain('disabled=""');
    p.data.assignments=[{userId:5,roleIds:[]}];
    const cleared=render(p);
    expect(buttons(cleared).find(tag=>tag.includes('حفظ أدوار الموظف'))).not.toContain('disabled=""');
    expect(inputs(cleared).filter(tag=>tag.includes('name="roleIds"')).every(tag=>tag.includes('disabled'))).toBe(true);
  });
});
