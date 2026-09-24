import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({require:vi.fn(),access:vi.fn(),data:vi.fn(),monitor:vi.fn(),build:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('@/lib/finance/permissions',()=>({requireFinance:m.require,financePermissionsFromKeys:()=>({visibleSections:[]})}));
vi.mock('@/lib/access-control/guards',()=>({readActorAccess:m.access}));
vi.mock('@/lib/finance/read-model',()=>({readFinanceData:m.data}));
vi.mock('@/lib/finance/audit-visibility',()=>({redactFinanceAudit:(data:unknown)=>data}));
vi.mock('@/lib/finance/reports',()=>({parseFinanceQuery:(q:Record<string,string>)=>({section:q.section||'overview',month:q.month}),buildFinanceReport:m.build}));
vi.mock('@/lib/finance/tax-registration-read',()=>({readTaxRegistrationMonitor:m.monitor}));
vi.mock('@/components/finance/finance-workspace',()=>({FinanceWorkspace:()=>React.createElement('div',null,'financial workspace')}));
vi.mock('@/components/finance/tax-registration-monitor',()=>({TaxRegistrationMonitor:()=>React.createElement('div',null,'rolling tax monitor')}));
import Page from '@/app/admin/finance/page';
beforeEach(()=>{vi.clearAllMocks();m.require.mockResolvedValue({uid:7});m.access.mockResolvedValue({keys:new Set(['tax:view'])});m.data.mockResolvedValue({});m.build.mockReturnValue({});m.monitor.mockResolvedValue({});});
describe('finance tax monitor server page authorization',()=>{
 it('loads rolling totals for an authorized tax viewer independently of the selected report month',async()=>{
  const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({section:'tax',month:'2020-01'})}));
  expect(html).toContain('rolling tax monitor');expect(m.monitor).toHaveBeenCalledWith(expect.anything(),7n,expect.any(Date));
  expect(m.monitor.mock.calls[0][2].getFullYear()).toBe(new Date().getFullYear());
 });
 it('does not read or render tax figures for finance-only overview access',async()=>{
  m.access.mockResolvedValue({keys:new Set(['finance:view'])});
  const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));expect(html).not.toContain('rolling tax monitor');expect(m.monitor).not.toHaveBeenCalled();
 });
 it('stops before every read when the section guard denies direct access',async()=>{
  m.require.mockRejectedValue(Error('forbidden'));await expect(Page({searchParams:Promise.resolve({section:'tax'})})).rejects.toThrow('forbidden');expect(m.data).not.toHaveBeenCalled();expect(m.monitor).not.toHaveBeenCalled();
 });
 it('propagates a fresh permission failure instead of showing a misleading zero balance',async()=>{
  m.monitor.mockRejectedValue(Error('forbidden'));await expect(Page({searchParams:Promise.resolve({section:'tax'})})).rejects.toThrow('forbidden');
 });
});
