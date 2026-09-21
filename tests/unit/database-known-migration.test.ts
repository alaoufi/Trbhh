import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll,describe,expect,it} from 'vitest';

const dir=mkdtempSync(join(tmpdir(),'database-known-migration-')),script=resolve('scripts/release/database-proof.cjs'),db='a'.repeat(64),otherKey='b'.repeat(64),otherRow='c'.repeat(64);
afterAll(()=>rmSync(dir,{recursive:true,force:true}));
const normalized=(value:unknown):unknown=>value===null||value===undefined?['null']:Array.isArray(value)?['array',value.map(normalized)]:typeof value==='object'?['object',Object.keys(value).sort().map(key=>[key,normalized((value as Record<string,unknown>)[key])])]:[typeof value,String(value)];
const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(normalized(value))).digest('hex');
const key='msg_topup_ok',oldValue='شكراً لثقتك في منصة تربح {name} 🎉 تم إضافة رصيد بمبلغ {amount} ر.س — يمكنك استخدامه في المدفوعات المختلفة. — الإدارة',newValue='تم تأكيد الشحن وإضافة {amount} ر.س إلى رصيدك ✅ شكراً لاختياركم تربح {name}، نتمنى لكم التوفيق 🎉 بإمكانكم استخدام الرصيد بكافة الوسائل لدعم إعلاناتكم. — الإدارة';
const keyHash=fingerprint([key]),row=(value:string)=>fingerprint([['k',key],['v',value]]);
const baseTable={count:1,engine:'InnoDB',primaryKeyColumns:['id'],primaryKeys:[otherKey],protectedColumns:['name'],rowFingerprints:{[otherKey]:otherRow}};
const manifest=(value:string)=>({format:'trbhh-database-proof-v1',databaseIdentitySha256:db,tables:{users:structuredClone(baseTable),ads:structuredClone(baseTable),site_settings:{count:1,engine:'InnoDB',primaryKeyColumns:['k'],primaryKeys:[keyHash],protectedColumns:['k','v'],rowFingerprints:{[keyHash]:row(value)}}}});
const compare=(before:unknown,after:unknown)=>{const a=join(dir,'a.json'),b=join(dir,'b.json');writeFileSync(a,JSON.stringify(before));writeFileSync(b,JSON.stringify(after));return spawnSync(process.execPath,[script,'verify-known-migration',a,b,'msg_topup_ok_v1'],{encoding:'utf8',timeout:10000});};
const runtimeManifest=(value:string)=>{const runtimeKey='sub_remind_lastrun',runtimeKeyHash=fingerprint([runtimeKey]);return {format:'trbhh-database-proof-v1',databaseIdentitySha256:db,tables:{users:structuredClone(baseTable),ads:structuredClone(baseTable),site_settings:{count:1,engine:'InnoDB',primaryKeyColumns:['k'],primaryKeys:[runtimeKeyHash],protectedColumns:['k','v'],rowFingerprints:{[runtimeKeyHash]:fingerprint([['k',runtimeKey],['v',value]])}}}};};

describe('known boot migration preservation proof',()=>{
 it('accepts an unchanged protected snapshot',()=>{const before=manifest(newValue),result=compare(before,structuredClone(before));expect(result.status,result.stderr).toBe(0);expect(JSON.parse(result.stdout)).toMatchObject({ok:true,migration:'none'});});
 it('accepts only the exact legacy-to-current message migration without exposing values',()=>{const result=compare(manifest(oldValue),manifest(newValue));expect(result.status,result.stderr).toBe(0);expect(JSON.parse(result.stdout)).toMatchObject({ok:true,migration:'shipping_credit_message_v1'});expect(result.stdout).not.toContain(key);expect(result.stdout).not.toContain(oldValue);});
 it('rejects any other setting change or direction',()=>{expect(compare(manifest(newValue),manifest(oldValue)).status).toBe(1);const changed=manifest(newValue);changed.tables.site_settings.rowFingerprints[keyHash]='d'.repeat(64);expect(compare(manifest(oldValue),changed).status).toBe(1);});
 it('accepts only the subscription reminder runtime marker as an operational change',()=>{const result=compare(runtimeManifest('2026-09-21T10:00:00.000Z'),runtimeManifest('2026-09-21T10:30:00.000Z'));expect(result.status,result.stderr).toBe(0);expect(JSON.parse(result.stdout)).toMatchObject({ok:true,migration:'subscription_reminder_runtime_marker'});expect(result.stdout).not.toContain('sub_remind_lastrun');});
});
