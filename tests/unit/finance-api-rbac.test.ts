import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),session:vi.fn(),read:vi.fn(),invoice:vi.fn(),audit:vi.fn()}));
vi.mock('react',()=>({cache:(fn:unknown)=>fn}));
vi.mock('@/lib/access-control/store',()=>({readAccess:m.access}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('@/lib/auth',()=>({getSession:m.session}));
vi.mock('@/data/schema-sync',()=>({ensureSchema:async()=>{}}));
vi.mock('next/navigation',()=>({redirect:(path:string)=>{throw new Error('redirect:'+path);}}));
vi.mock('next/headers',()=>({headers:async()=>({get:()=>null}),cookies:async()=>({get:()=>undefined})}));
vi.mock('@/lib/finance/read-model',()=>({readFinanceData:m.read}));
vi.mock('@/lib/finance/documents',()=>({readFinanceInvoice:m.invoice,customerInvoice:(value:unknown)=>value}));
vi.mock('@/lib/finance/service',()=>({recordFinanceExport:m.audit}));
vi.mock('@/lib/finance/exports',()=>({printableFinanceReport:()=>'<p>Authorized financial report</p>',financeSectionExportSheets:()=>[],printableFinanceInvoice:()=>'<p>Invoice</p>'}));
vi.mock('@/lib/finance/reports',async original=>({...await original<object>(),buildFinanceReport:()=>({})}));
import {GET} from '@/app/admin/finance/export/route';
import {requireAccess} from '@/lib/access-control/guards';
const request=(section='overview',extra='')=>new Request('https://trbhh.example/admin/finance/export?format=print&month=2026-08&section='+section+extra);
const grants=(keys:string[])=>m.access.mockResolvedValue({ready:true,keys:new Set(keys),roles:[]});
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({uid:73,authVersion:'0'});grants([]);m.read.mockResolvedValue({});m.audit.mockResolvedValue(undefined);});
describe('direct finance endpoint capability enforcement',()=>{
  it('support cannot access financial settings or export by guessing the URL',async()=>{
    grants(['messages:view','users:view']);
    await expect(requireAccess('tax','manage_settings')).rejects.toThrow('access=denied');
    await expect(GET(request('tax'))).rejects.toThrow('access=denied');
    expect(m.read).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
  });
  it('accountants cannot manage users or roles without an explicit separate grant',async()=>{
    grants(['finance:view','budget:view','budget:edit']);
    await expect(requireAccess('users','edit')).rejects.toThrow('access=denied');
    await expect(requireAccess('access_control','manage_settings')).rejects.toThrow('access=denied');
    grants(['finance:view','users:edit']);expect(await requireAccess('users','edit')).toHaveProperty('uid',73);
  });
  it('an auditor can read but cannot export until explicitly granted',async()=>{
    grants(['finance:view','audit:view']);await expect(GET(request())).rejects.toThrow('access=denied');expect(m.read).not.toHaveBeenCalled();
    grants(['finance:view','finance:export','audit:view']);
    const response=await GET(request());expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.text()).toContain('Authorized financial report');expect(m.audit).toHaveBeenCalledOnce();
    await expect(requireAccess('budget','edit')).rejects.toThrow('access=denied');
    await expect(requireAccess('settlements','approve')).rejects.toThrow('access=denied');
  });
  it('invoice ID cannot bypass the independent invoice export grant',async()=>{
    grants(['finance:view','finance:export']);await expect(GET(request('overview','&invoiceId=91'))).rejects.toThrow('access=denied');expect(m.invoice).not.toHaveBeenCalled();
  });
  it('allows an explicitly authorized invoice print and records its own export scope',async()=>{
    grants(['invoices:view','invoices:export']);m.invoice.mockResolvedValue({id:'91',at:'2026-08-15T12:00:00Z'});
    const response=await GET(request('overview','&invoiceId=91'));
    expect(response.status).toBe(200);expect(await response.text()).toContain('Invoice');
    expect(m.audit).toHaveBeenCalledWith(expect.anything(),73n,'2026-08','print','invoice:91');expect(m.read).not.toHaveBeenCalled();
  });
  it('missing authentication or failed access storage prevents data queries',async()=>{
    m.session.mockResolvedValue(null);await expect(GET(request())).rejects.toThrow('/login');
    m.session.mockResolvedValue({uid:73});m.access.mockRejectedValue(new Error('storage unavailable'));
    await expect(GET(request())).rejects.toThrow('access=denied');expect(m.read).not.toHaveBeenCalled();
  });
});
