import {describe,it,expect,vi,beforeEach} from 'vitest';
import {cjSettlementFreshnessAmount,cjPayableSelectable,cjPayableHoldReason} from '@/lib/cj/settlements/presentation';
const mocks=vi.hoisted(()=>({query:vi.fn(),setting:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{$queryRaw:mocks.query,site_settings:{findUnique:mocks.setting}}}));
import {listCjPayables,getCjSettlementBatch} from '@/lib/cj/settlements';
const quote={lines:[{quantity:1,supplierUnitUsdMinor:1000}],supplierFreightUsdMinor:200,supplierTaxUsdMinor:0,supplierUsdMinor:1200};
describe('CJ payable hold and separate payment path presentation',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.setting.mockResolvedValue({v:'24'});});
 it('reads newer quote evidence without mutating approved financial total',()=>{
  expect(cjSettlementFreshnessAmount(JSON.stringify({proof:{freshness:{actualUsdMinor:1300}}}))).toBe(1300);
  for(const invalid of ['{',{proof:{freshness:{actualUsdMinor:'1300'}}},{proof:{freshness:{actualUsdMinor:NaN}}}])expect(cjSettlementFreshnessAmount(invalid)).toBeNull();
  const ready={status:'payment_ready',cjOrderId:'CJ123',lastError:null,payExpiresAt:new Date(2000),totalUsdMinor:1200,actualUsdMinor:null};
  expect(cjPayableSelectable(ready,1000)).toBe(true);expect(cjPayableSelectable({...ready,lastError:'stock_changed'},1000)).toBe(false);expect(cjPayableSelectable({...ready,actualUsdMinor:1300},1000)).toBe(false);expect(cjPayableSelectable(ready,3000)).toBe(false);expect(cjPayableHoldReason('blocked','stock_changed')).toContain('المخزون');
 });
 it('retains uncreated and blocked paid customer rows but cannot select them',async()=>{
  mocks.query.mockResolvedValue([{id:2n,commerce_order_id:9n,cj_order_id:null,status:'pending',quote_json:quote,paid_at:new Date(0),pay_expires_at:null,last_error:null},{id:3n,commerce_order_id:10n,cj_order_id:'CJ123',status:'blocked',quote_json:quote,paid_at:new Date(0),pay_expires_at:null,last_error:'supplier_price_changed',evidence_json:{proof:{freshness:{actualUsdMinor:1300}}}}]);
  const rows=await listCjPayables();expect(rows).toHaveLength(2);expect(rows.every(row=>!row.selectable)).toBe(true);expect(rows[1].totalUsdMinor).toBe(1200);expect(rows[1].actualUsdMinor).toBe(1300);expect(rows[0].holdReason).toContain('لم يُجهّز');
  const sql=mocks.query.mock.calls[0][0].join('');expect(sql).toContain("o.status='paid'");expect(sql).toContain('commerce_receipts');expect(sql).toContain("'create_uncertain'");
 });
 it('hides card payment on active wallet authorization, supplier hold or changed cost',async()=>{
  const line={outbox_id:2n,commerce_order_id:9n,cj_order_id:'CJ123',status:'pending',product_usd_minor:1000,shipping_usd_minor:200,tax_usd_minor:0,total_usd_minor:1200,pay_id:'pay_123',pay_expires_at:new Date(Date.now()+60000),fulfillment_status:'payment_ready',last_error:null,evidence_json:null,wallet_authorized:0n};
  mocks.query.mockResolvedValueOnce([{id:8n,status:'prepared',total_usd_minor:3600,created_at:new Date()}]).mockResolvedValueOnce([{...line,wallet_authorized:1n},{...line,outbox_id:3n,last_error:'stock_changed'},{...line,outbox_id:4n,evidence_json:{proof:{freshness:{actualUsdMinor:1300}}}}]);
  const batch=await getCjSettlementBatch('8');expect(batch?.lines.every(item=>item.paymentUrl===null)).toBe(true);expect(batch?.lines[0].walletAuthorized).toBe(true);expect(batch?.lines[2].actualUsdMinor).toBe(1300);
 });
});
it('explains unavailable wallet evidence without treating it as failed debit',()=>{const text=cjPayableHoldReason('debit_uncertain','wallet_billing_unavailable_manual_review');expect(text).toContain('سجل محفظة CJ');expect(text).toContain('لا تكرر الدفع');expect(text).toContain('مرجع الحركة');});
it.each(['payment_proof_incomplete','awaiting_payment_proof'])('explains incomplete debit proof %s',error=>{expect(cjPayableHoldReason('debit_uncertain',error)).toContain('لا تكرر الدفع');});
