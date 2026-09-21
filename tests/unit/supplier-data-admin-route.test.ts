import {beforeEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const state=vi.hoisted(()=>({session:vi.fn(),permission:vi.fn(),issue:vi.fn(),revoke:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSession:state.session}));
vi.mock('@/lib/roles',()=>({hasAction:state.permission}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('@/lib/suppliers/data-invitations',()=>({issueSupplierDataInvitation:state.issue,revokeSupplierDataInvitation:state.revoke}));
import {POST} from '@/app/api/suppliers/data-invite/admin/route';

function request(mode='issue',origin='https://trbhh.sa'){return new NextRequest('https://trbhh.sa/api/suppliers/data-invite/admin',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({supplierId:'7',mode})});}
beforeEach(()=>{vi.clearAllMocks();state.session.mockResolvedValue({uid:3});state.permission.mockResolvedValue(true);state.issue.mockResolvedValue({url:'https://trbhh.sa/supplier/data/'+ 'A'.repeat(43),expiresAt:new Date('2026-09-29T00:00:00Z'),generation:2});state.revoke.mockResolvedValue({status:'revoked'});process.env.SUPPLIER_PUBLIC_ORIGIN='https://trbhh.sa';process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY='ab'.repeat(32);});
describe('supplier data invitation admin endpoint',()=>{
 it('requires admin edit permission and same origin',async()=>{state.permission.mockResolvedValueOnce(false);expect((await POST(request())).status).toBe(403);expect(state.issue).not.toHaveBeenCalled();state.permission.mockResolvedValueOnce(true);expect((await POST(request('issue','https://attacker.example'))).status).toBe(403);expect(state.issue).not.toHaveBeenCalled();});
 it('issues and revokes only for the authenticated admin identity',async()=>{const issued=await POST(request());expect(issued.status).toBe(200);expect(state.issue).toHaveBeenCalledWith({},7n,3n,'ab'.repeat(32),'https://trbhh.sa');const revoked=await POST(request('revoke'));expect(revoked.status).toBe(200);expect(state.revoke).toHaveBeenCalledWith({},7n,3n);});
});
