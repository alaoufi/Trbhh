import {describe,it,expect} from 'vitest';
import {createHmac} from 'node:crypto';
import {parseSallaEvent} from '@/lib/suppliers/webhooks';
const secret='synthetic-test-key',now=new Date('2026-09-19T12:00:00Z');
function signed(value:unknown){const raw=Buffer.from(JSON.stringify(value));return {raw,signature:createHmac('sha256',secret).update(raw).digest('hex')};}
describe('Salla signed event envelope',()=>{
 it('rejects unauthenticated and stale messages',()=>{const {raw,signature}=signed({event:'product.updated',merchant:1,created_at:'2020-01-01T00:00:00Z',data:{id:2}});expect(()=>parseSallaEvent(raw,'invalid',secret,now)).toThrow('supplier_webhook_signature');expect(()=>parseSallaEvent(raw,signature,secret,now)).toThrow('supplier_webhook_timestamp');});
 it('extracts nested order identity and stores no customer payload',()=>{const {raw,signature}=signed({event:'order.status.updated',merchant:1,created_at:now.toISOString(),data:{id:999,order:{id:42},customer:{phone:'private'}}});const event=parseSallaEvent(raw,signature,secret,now);expect(event.resourceId).toBe('42');expect(JSON.stringify(event)).not.toContain('private');});
 it('uses deterministic duplicate identity',()=>{const {raw,signature}=signed({event:'product.updated',merchant:1,created_at:now.toISOString(),data:{id:2}});expect(parseSallaEvent(raw,signature,secret,now).key).toBe(parseSallaEvent(raw,signature,secret,now).key);});
 it('ignores unsupported events including Easy-mode token delivery',()=>{const {raw,signature}=signed({event:'app.store.authorize',merchant:1,created_at:now.toISOString(),data:{access_token:'must-not-persist'}});expect(parseSallaEvent(raw,signature,secret,now).kind).toBe('ignore');});
});
