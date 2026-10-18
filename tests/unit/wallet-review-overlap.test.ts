import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {reconcileWalletReviews,walletSourceFingerprint} from '@/lib/finance/wallet-review-model';
const s={id:'1',userId:'2',amountMinor:-100,reason:'featured',sourceReference:'service:9',at:'2026-10-01T00:00:00Z'};
const d={version:1 as const,sourceId:'1',sourceFingerprint:walletSourceFingerprint(s),expectedLatestDecisionId:null,requestKey:'request-1',status:'approved' as const,sourceReference:'service:9',documentaryReference:'invoice:1',documentLineIdentity:'issuer:invoice:1:line:1',evidenceKind:'service_invoice' as const,classification:'standard' as const,netMinor:100,note:'reviewed'};
describe('wallet invoice overlap',()=>{it('rejects reused invoice documentary identity',()=>{expect(reconcileWalletReviews([s],[{id:'2',entityId:'1',action:'wallet_review_decision',entity:'wallet_txn_review',payload:d}],[d.documentLineIdentity]).events).toEqual([]);});});

it('rejects an exact issued invoice documentary reference',()=>{expect(reconcileWalletReviews([s],[{id:'2',entityId:'1',action:'wallet_review_decision',entity:'wallet_txn_review',payload:d}],[d.documentaryReference]).events).toEqual([]);});
it('fingerprints raw note independently of the stable reference',()=>{expect(walletSourceFingerprint({...s,note:'first'})).not.toBe(walletSourceFingerprint({...s,note:'changed'}));});
