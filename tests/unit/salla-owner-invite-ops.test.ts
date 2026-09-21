import {constants, createDecipheriv, generateKeyPairSync, privateDecrypt} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {PrismaClient} from '@prisma/client';
vi.mock('../../src/lib/suppliers/merchant-oauth', () => ({issueMerchantInvitation: vi.fn()}));
import {issueMerchantInvitation} from '../../src/lib/suppliers/merchant-oauth';
import {encryptReport, main, reportPublicKey, runOwnerInvitation} from '../../scripts/release/salla-owner-invite';

const env = {SUPPLIER_PUBLIC_ORIGIN:'https://trbhh.sa', SALLA_CLIENT_ID:'client', SALLA_CLIENT_SECRET:'secret', SUPPLIER_TOKEN_ENCRYPTION_KEY:'ab'.repeat(32), SUPPLIER_ALLOW_LIVE_ORDERS:'false'};
const {publicKey, privateKey} = generateKeyPairSync('rsa', {modulusLength:2048});
const keyEnv = {...env,SALLA_AUDIT_REPORT_PUBLIC_KEY_B64:publicKey.export({type:'spki',format:'pem'}).toString().valueOf()};
keyEnv.SALLA_AUDIT_REPORT_PUBLIC_KEY_B64=Buffer.from(keyEnv.SALLA_AUDIT_REPORT_PUBLIC_KEY_B64).toString('base64');
const issue=vi.mocked(issueMerchantInvitation);
function database(overrides: {flags?:unknown[];automatic?:unknown[];target?:unknown[];profile?:unknown[];connections?:unknown[];issuers?:unknown[];admin?:unknown[]} = {}) {
  const query = vi.fn()
    .mockResolvedValueOnce(overrides.flags ?? [])
    .mockResolvedValueOnce(overrides.automatic ?? [])
    .mockResolvedValueOnce(overrides.target ?? [{id:2n,name:'شعبيات الأولين',active:1}])
    .mockResolvedValueOnce(overrides.profile ?? [])
    .mockResolvedValueOnce(overrides.connections ?? [])
    .mockResolvedValueOnce(overrides.issuers ?? [{admin_id:7n}])
    .mockResolvedValueOnce(overrides.admin ?? [{id:7n,is_admin:1}]);
  return {$queryRaw:query,$transaction:vi.fn(),$disconnect:vi.fn()} as unknown as PrismaClient;
}
function decrypt(envelope:ReturnType<typeof encryptReport>) {
  const key=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(envelope.wrappedKey,'base64'));
  const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));
  cipher.setAAD(Buffer.from(envelope.aad,'base64'));cipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(envelope.ciphertext,'base64')),cipher.final()]).toString());
}
beforeEach(()=>{vi.clearAllMocks();issue.mockResolvedValue({invitation:'signed-secret',url:'https://trbhh.sa/api/integrations/salla/authorize?invite=signed-secret',expiresAt:new Date('2026-09-23T00:00:00Z')});});

describe('approved owner invitation operation',()=>{
  it('uses the current issuer and exact supplier through existing invitation implementation',async()=>{
    const db=database();
    const report=await runOwnerInvitation(db,env);
    expect(issue).toHaveBeenCalledOnce();expect(issue.mock.calls[0].slice(0,3)).toEqual([db,2n,7n]);
    expect(report).toMatchObject({supplierId:'2',issuerAdminId:'7',purchasingEnabled:false,paymentsEnabled:false,liveOrdersEnabled:false,productsPublished:false});
    const sql=vi.mocked(db.$queryRaw).mock.calls.map(([parts])=>(parts as TemplateStringsArray).join('')).join('\n');
    expect(sql).not.toMatch(/INSERT|UPDATE|DELETE|ALTER|CREATE|encrypted_tokens/);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it.each(['true','',undefined])('requires explicitly disabled live orders (%s)',async value=>{
    const db=database();await expect(runOwnerInvitation(db,{...env,SUPPLIER_ALLOW_LIVE_ORDERS:value})).rejects.toThrow();
    expect(db.$queryRaw).not.toHaveBeenCalled();expect(issue).not.toHaveBeenCalled();
  });
  it.each(['commerce_enabled','commerce_purchasing_enabled','commerce_payments_enabled'])('refuses enabled %s',async k=>{
    await expect(runOwnerInvitation(database({flags:[{k,v:'1'}]}),env)).rejects.toThrow('owner_invitation_purchase_gate');expect(issue).not.toHaveBeenCalled();
  });
  it.each([
    {automatic:[{id:1n}]},
    {target:[{id:1n,name:'شعبيات الأولين',active:1}]},
    {target:[{id:2n,name:'متجر تجريبي',active:1}]},
    {target:[{id:2n,name:'شعبيات الأولين',active:0}]},
    {profile:[{provider:'salla',mode:'live',maintenance:0,sync_enabled:0,auto_orders_enabled:0}]},
    {connections:[{id:1n}]},
    {issuers:[]},
    {issuers:[{admin_id:7n},{admin_id:8n}]},
    {issuers:[{admin_id:9007199254740993n}]},
    {admin:[{id:7n,is_admin:0}]},
  ])('fails closed before issuing on inconsistent preflight case %#',async overrides=>{
    await expect(runOwnerInvitation(database(overrides),env)).rejects.toThrow();expect(issue).not.toHaveBeenCalled();
  });
  it('validates report encryption before accessing any database or issuing',async()=>{
    const db=database(),out=vi.fn(),error=vi.fn();
    expect(await main(env,{db,output:out,error})).toBe(1);expect(db.$queryRaw).not.toHaveBeenCalled();expect(out).not.toHaveBeenCalled();expect(issue).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('Salla owner invitation refused: encrypted report key required.\n');
  });
  it('emits the whole signed URL only inside an authenticated encrypted envelope',async()=>{
    const output=vi.fn(),error=vi.fn();
    expect(await main(keyEnv,{db:database(),output,error})).toBe(0);
    const raw=output.mock.calls[0][0];expect(raw).not.toContain('signed-secret');expect(raw).not.toContain('authorize?');expect(error).not.toHaveBeenCalled();
    const envelope=JSON.parse(raw);expect(envelope.kind).toBe('salla_owner_invitation_encrypted');expect(decrypt(envelope).url).toContain('invite=signed-secret');
  });
  it('suppresses raw database errors and never emits unencrypted failure details',async()=>{
    const db=database(),output=vi.fn(),error=vi.fn();vi.mocked(db.$queryRaw).mockReset().mockRejectedValue(Error('raw-sql-secret-token'));
    expect(await main(keyEnv,{db,output,error})).toBe(1);
    expect(output.mock.calls[0][0]).not.toContain('raw-sql-secret-token');expect(error).not.toHaveBeenCalled();
    expect(decrypt(JSON.parse(output.mock.calls[0][0])).errors).toEqual(['owner_invitation_failed']);expect(issue).not.toHaveBeenCalled();
  });
  it.each([
    'owner_invitation_unsafe_environment', 'owner_invitation_purchase_gate', 'owner_invitation_automatic_orders',
    'owner_invitation_target_mismatch', 'owner_invitation_target_profile', 'owner_invitation_target_connected',
    'owner_invitation_issuer_ambiguous', 'owner_invitation_issuer_unauthorized',
    'supplier_origin_config', 'supplier_oauth_config', 'supplier_connection_unavailable',
    'supplier_merchant_already_connected', 'supplier_oauth_generation', 'supplier_merchant_invitation_invalid',
  ])('returns only the encrypted allowlisted failure code %s',async safeCode=>{
    const db=database(),output=vi.fn(),error=vi.fn();vi.mocked(db.$queryRaw).mockReset().mockRejectedValue(Error(safeCode));
    expect(await main(keyEnv,{db,output,error})).toBe(1);
    expect(output.mock.calls[0][0]).not.toContain(safeCode);expect(error).not.toHaveBeenCalled();
    expect(decrypt(JSON.parse(output.mock.calls[0][0])).errors).toEqual([safeCode]);expect(issue).not.toHaveBeenCalled();
  });
  it('rejects malformed or non-RSA report keys',()=>{
    expect(()=>reportPublicKey({...env,SALLA_AUDIT_REPORT_PUBLIC_KEY_B64:'bad'})).toThrow();
    const pair=generateKeyPairSync('ed25519');
    const pem=pair.publicKey.export({type:'spki',format:'pem'}).toString();
    expect(()=>reportPublicKey({...env,SALLA_AUDIT_REPORT_PUBLIC_KEY_B64:Buffer.from(pem).toString('base64')})).toThrow();
  });
});

describe('source-backed stdin bundle',()=>{
  it('builds without new dependencies and refuses missing encryption key before loading Prisma',()=>{
    const require=createRequire(import.meta.url);
    const {build}=require('../../scripts/release/build-salla-owner-invite.cjs');
    const bundled=build();
    expect(bundled).toContain('async function issueMerchantInvitation');
    expect(bundled).not.toContain('function ensureSchema');
    expect(bundled).not.toContain('new PrismaClient({');
    const run=spawnSync(process.execPath,['-'],{input:bundled,encoding:'utf8',env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,NODE_ENV:'production'}});
    expect(run.status).toBe(1);expect(run.stdout).toBe('');expect(run.stderr).toBe('Salla owner invitation refused: encrypted report key required.\n');
  });
  it('writes only a new explicit .cjs output file and refuses overwrite',()=>{
    const temp=mkdtempSync(path.join(tmpdir(),'trbhh-invite-build-'));
    try{
      const file=path.join(temp,'bundle.cjs');
      const script=path.resolve('scripts/release/build-salla-owner-invite.cjs');
      const run=spawnSync(process.execPath,[script,'--output',file],{encoding:'utf8'});
      expect(run.status).toBe(0);expect(run.stdout).toBe('');expect(readFileSync(file,'utf8')).toContain('owner_invitation_module_not_allowed');
      writeFileSync(file,'existing');
      const repeat=spawnSync(process.execPath,[script,'--output',file],{encoding:'utf8'});
      expect(repeat.status).toBe(1);expect(readFileSync(file,'utf8')).toBe('existing');
    }finally{
      if(path.dirname(path.resolve(temp))!==path.resolve(tmpdir()))throw Error('temporary_test_path_unsafe');
      rmSync(temp,{recursive:true,force:true});
    }
  });
});
