import {describe,it,expect,vi,beforeEach} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const mocks=vi.hoisted(()=>({access:vi.fn(),query:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{$queryRaw:mocks.query}}));
vi.mock('@/lib/access-control/guards',()=>({requireAccess:mocks.access}));
vi.mock('@/components/access-boundary',()=>({AccessPage:({children}:{children:React.ReactNode})=>children}));
vi.mock('@/components/cj/admin-nav',()=>({CjAdminNav:()=>null}));
vi.mock('@/lib/cj/fulfillment/status',()=>({safeTrackingUrl:()=>null}));
import {CjJourneyPage} from '@/components/cj/journey-page';
const row={id:1n,status:'paid',fulfillment_status:'processing',supplier_status:'supplier_paid',cj_order_id:'CJ-1',evidence_json:{fulfillment:{stage:'preparing'}},receipt_verified:1n,outbox_id:2n,last_error:null,fulfillment_group:'group-1',quote_json:{lines:[{quantity:1,supplierUnitUsdMinor:200}],supplierFreightUsdMinor:300,supplierTaxUsdMinor:0,supplierUsdMinor:500}};
describe('real CJ journey views',()=>{
beforeEach(()=>{vi.clearAllMocks();mocks.access.mockResolvedValue({uid:1});mocks.query.mockResolvedValue([row]);});
it('shows stored CJ payment evidence in administration only after verified settlement',async()=>{const proof={order:{paymentDate:'2026-10-15 10:00:00',payableUsdMinor:500},bill:{id:'BILL-7'},payment:{payId:'PAY-7'}};mocks.query.mockResolvedValue([{...row,evidence_json:{proof,...row.evidence_json,payment:{payId:'PAY-7'}}}]);const html=renderToStaticMarkup(await CjJourneyPage({stage:'preparation'}));expect(html).toContain('تأكيد سداد المورد');expect(html).toContain('2026-10-15 10:00:00');expect(html).toContain('PAY-7');expect(html).toContain('BILL-7');mocks.query.mockResolvedValue([{...row,supplier_status:'payment_ready',evidence_json:{proof}}]);expect(renderToStaticMarkup(await CjJourneyPage({stage:'purchases'}))).not.toContain('تأكيد سداد المورد:');});
it('checks authority before database reads',async()=>{mocks.access.mockRejectedValueOnce(Error('denied'));await expect(CjJourneyPage({stage:'preparation'})).rejects.toThrow('denied');expect(mocks.query).not.toHaveBeenCalled();});
it('uses real quotes and exact shipment group without writes',async()=>{const html=renderToStaticMarkup(await CjJourneyPage({stage:'preparation'}));expect(mocks.access).toHaveBeenCalledWith('shipping','view');const sql=mocks.query.mock.calls[0][0].join('');expect(sql).toContain('commerce_cj_order_quotes');expect(sql).toContain('f.fulfillment_group=q.fulfillment_group');expect(sql).not.toMatch(/INSERT|UPDATE|DELETE|cj_orders/);expect(html).toContain('CJ-1');expect(html).toContain('5.00');});
it('does not call delivery closed without customer receipt confirmation',async()=>{mocks.query.mockResolvedValue([{...row,evidence_json:{fulfillment:{stage:'delivered'}}}]);const html=renderToStaticMarkup(await CjJourneyPage({stage:'history'}));expect(html).toContain('لا توجد سجلات');expect(html).not.toContain('CJ-1');});
});
