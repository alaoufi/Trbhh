import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
vi.mock('@/app/admin/finance/actions',()=>({saveFinanceWalletReview:async()=>{}}));
import {WalletReviewQueue} from '@/components/finance/wallet-review-queue';
import type {WalletReviewQueueRow} from '@/lib/finance/wallet-review-model';
const row:WalletReviewQueueRow={id:'1',userId:'2',amountMinor:-10000,reason:'featured',sourceReference:'ad:4',at:'2026-10-18T00:00:00Z',sourceFingerprint:'abc',latestDecisionId:null,status:'open',missingEvidence:['documentary_review_required'],decisions:[]};
const render=(rows=[row],canApprove=false,error=false)=>renderToStaticMarkup(createElement(WalletReviewQueue,{queue:{rows,total:61,page:2,pages:3},canApprove,error,month:'2026-10',actionKey:'key'}));
describe('wallet documentary review queue',()=>{
 it('is read only without approval and exposes all pagination with anchor',()=>{const html=render();expect(html).not.toContain('<form');expect(html).toContain('walletPage=1');expect(html).toContain('walletPage=3');expect(html).toContain('#wallet-review');expect(html).toContain('ad:4');expect(html).toContain('ليس فاتورة ضريبية');});
 it('requires explicit evidence, empty classification and confirmation for approval',()=>{const html=render([row],true);for(const name of ['sourceFingerprint','expectedLatestDecisionId','documentaryReference','documentLineIdentity','evidenceKind','classification','net','confirm','requestKey'])expect(html).toContain('name="'+name+'"');expect(html).toContain('value=""');expect(html).not.toContain('checked=""');});
 it('never offers approval for refunds and clearly retains the gap',()=>{const html=render([{...row,amountMinor:10000,reason:'refund'}],true);expect(html).not.toContain('value="approved"');expect(html).toContain('التوريد الأصلي');expect(html).toContain('يبقى مفتوحًا');});
 it('shows escaped stale history and read errors distinctly from empty queue',()=>{const html=render([{...row,status:'stale',decisions:[{id:'55',decision:{version:1,sourceId:'1',sourceFingerprint:'old',expectedLatestDecisionId:null,requestKey:'old',status:'needs_document',sourceReference:'ad:4',note:'<script>bad</script>'}}]}]);expect(html).toContain('تغير المصدر');expect(html).toContain('55');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(render([],false,true)).toContain('تعذر قراءة');expect(render([],false,true)).not.toContain('لا توجد حركات');});
});
it('renders verified audit timestamps and actor IDs, with safe missing/invalid fallbacks',()=>{
 const decision={version:1 as const,sourceId:'1',sourceFingerprint:'abc',expectedLatestDecisionId:null,requestKey:'old',status:'needs_document' as const,sourceReference:'ad:4',note:'review'};
 const html=render([{...row,decisions:[{id:'60',decision,at:'2026-10-18T10:30:00Z',actorId:'9'},{id:'61',decision,at:'bad-date',actorId:'<script>'},{id:'62',decision}]}]);
 expect(html).toContain('dateTime="2026-10-18T10:30:00.000Z"');expect(html).toContain('المراجع #9');expect(html.match(/تاريخ القرار غير متاح/g)).toHaveLength(2);expect(html.match(/المراجع غير متاح/g)).toHaveLength(2);expect(html).not.toContain('bad-date');expect(html).not.toContain('<script>');
});
it('locks an existing source reference and allows explicit legacy evidence reference when absent',()=>{
 expect(render([row],true)).toMatch(/(?=[^>]*name="sourceReference")(?=[^>]*readOnly="")[^>]+/);
 const html=render([{...row,sourceReference:''}],true);expect(html).toContain('name="sourceReference"');expect(html).not.toContain('readOnly=""');expect(html).toContain('value=""');
});

it('shows the member balance source, escapes historic service notes, and formats source date safely',()=>{
 const html=render([{...row,note:'historic ad <img src=x onerror=bad>'}]);expect(html).toContain('href="/admin/revenue?tab=balances&amp;user=2"');expect(html).toContain('العضو #2');expect(html).toContain('historic ad &lt;img');expect(html).not.toContain('<img');expect(html).toContain('dateTime="2026-10-18T00:00:00.000Z"');
 const invalid=render([{...row,userId:'javascript:bad',at:'bad-date'}]);expect(invalid).not.toContain('href="/admin/revenue');expect(invalid).toContain('تاريخ المصدر غير متاح');expect(invalid).not.toContain('bad-date');
});
it('shows prior explicit classification and reviewed net without preselecting new approval',()=>{
 const html=render([{...row,decisions:[{id:'70',decision:{version:1,sourceId:'1',sourceFingerprint:'abc',expectedLatestDecisionId:null,requestKey:'old',status:'approved',sourceReference:'ad:4',note:'review',classification:'zero',netMinor:1025,evidenceKind:'service_invoice',documentaryReference:'INV:1',documentLineIdentity:'INV:1:2'}}]}],true);
 expect(html).toContain('التصنيف: خاضع بنسبة الصفر');expect(html).toContain('الصافي الموثّق: 10.25 ر.س');expect(html).toContain('INV:1:2');expect(html).toContain('فاتورة خدمة');expect(html).not.toContain('value="zero" selected');expect(html).not.toContain('value="approved" selected');
});
