import {beforeEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const state=vi.hoisted(()=>({save:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('@/lib/suppliers/data-invitations',()=>({saveSupplierDataInvitation:state.save}));
import {POST} from '@/app/api/suppliers/data-invite/route';

const token='A'.repeat(43);
function request(origin='https://trbhh.sa',intent='draft'){
 const body=new URLSearchParams({token,intent,store_name:'متجر الاختبار'});
 return new NextRequest('https://trbhh.sa/api/suppliers/data-invite',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body});
}
beforeEach(()=>{state.save.mockReset().mockResolvedValue({status:'draft',errors:[],warnings:[]});process.env.SUPPLIER_PUBLIC_ORIGIN='https://trbhh.sa';process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY='ab'.repeat(32);});

describe('supplier data invitation HTTP boundary',()=>{
 it('rejects cross-origin writes without touching the invitation',async()=>{
  const response=await POST(request('https://attacker.example'));
  expect(response.status).toBe(403);expect(state.save).not.toHaveBeenCalled();
 });

 it('accepts only allowed fields and redirects to the supplier page without an admin session',async()=>{
  const response=await POST(request());
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe(`https://trbhh.sa/supplier/data/${token}?saved=1`);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(state.save).toHaveBeenCalledWith({},token,expect.objectContaining({store_name:'متجر الاختبار'}),false,'ab'.repeat(32));
 });

 it('returns validation feedback instead of exposing an internal error',async()=>{
  state.save.mockRejectedValueOnce(Error('supplier_data_validation'));
  const response=await POST(request('https://trbhh.sa','submit'));
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe(`https://trbhh.sa/supplier/data/${token}?error=validation`);
 });
});
