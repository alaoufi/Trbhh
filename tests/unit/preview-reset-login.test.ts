import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {describe, expect, it, vi} from 'vitest';
const require = createRequire(import.meta.url);
const {resetPreviewLogin} = require('../../scripts/preview-v2/reset-login.cjs');
const hash = '$2b$10$' + 'a'.repeat(53);
const environment = () => ({PREVIEW_SANDBOX:'true', DATABASE_URL:'mysql://test:test@preview-db:3306/trbhh_preview_v2', PREVIEW_LOGIN_HASH:hash});
function fixture() {
  let rows = [{id:1001n,userName:'preview',is_admin:0,password:'old',auth_session_version:'old1'}, {id:1002n,userName:'preview-store',is_admin:0,password:'old',auth_session_version:'old2'}, {id:1003n,userName:'other',is_admin:0,password:'untouched',auth_session_version:'untouched'}];
  const tx = {
    $queryRaw: vi.fn().mockResolvedValueOnce([{database:'trbhh_preview_v2'}]).mockImplementation(async () => rows.filter(row => row.id === 1001n || row.id === 1002n)),
    site_settings:{findUnique:vi.fn().mockResolvedValue({v:'2026-09-19-v1'})},
    users:{updateMany:vi.fn(async ({where,data}:any) => {const row=rows.find(row=>row.id===where.id && row.userName===where.userName && row.is_admin===where.is_admin); if(!row)return {count:0}; Object.assign(row,data); return {count:1};})},
  };
  const prisma = {$transaction:vi.fn(async (work:any) => {const before=structuredClone(rows);try{return await work(tx);}catch(error){rows=before;throw error;}})};
  return {prisma,tx,rows:()=>rows};
}
describe('synthetic sandbox login reset', () => {
  it('runs explicit stdin invocation and fails closed without exposing credentials', () => {
    const script=readFileSync(require.resolve('../../scripts/preview-v2/reset-login.cjs'),'utf8');
    const result=spawnSync(process.execPath,['-'],{input:script,encoding:'utf8',env:{...process.env,...environment(),PREVIEW_SANDBOX:'false'},timeout:10000});
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe('Synthetic sandbox login reset failed.');
  });
  it('does not execute the CLI when imported by a no-argument process', () => {
    const path=require.resolve('../../scripts/preview-v2/reset-login.cjs');
    const result=spawnSync(process.execPath,[],{input:`require(${JSON.stringify(path)});`,encoding:'utf8',env:{...process.env,PREVIEW_SANDBOX:'false'},timeout:10000});
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });
  it.each([
    {PREVIEW_SANDBOX:'false'}, {PREVIEW_SANDBOX:undefined},
    {DATABASE_URL:'mysql://test:test@localhost/trbhh_preview_v2'},
    {DATABASE_URL:'mysql://test:test@production/trbhh_preview_v2'},
    {DATABASE_URL:'mysql://test:test@preview-db/trbhh'},
    {DATABASE_URL:'mysql://test:test@preview-db/trbhh_preview_v2?socket=/tmp/mysql.sock'},
    {PREVIEW_LOGIN_HASH:undefined}, {PREVIEW_LOGIN_HASH:'plaintext'},
    {PREVIEW_LOGIN_HASH:'$2b$03$'+'a'.repeat(53)}, {PREVIEW_LOGIN_HASH:hash+'\n'},
  ])('rejects unsafe environment before querying: %j', async override => {
    const f=fixture(); await expect(resetPreviewLogin(f.prisma,{...environment(),...override})).rejects.toThrow();
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('changes only the two synthetic passwords and rotates both sessions', async () => {
    const f=fixture(); await resetPreviewLogin(f.prisma,environment());
    const rows=f.rows();
    expect(rows.slice(0,2).map(row=>row.password)).toEqual([hash,hash]);
    for(const row of rows.slice(0,2)) expect(row.auth_session_version).toMatch(/^[0-9a-f-]{36}$/);
    expect(rows[0].auth_session_version).not.toBe(rows[1].auth_session_version);
    expect(rows[2]).toEqual({id:1003n,userName:'other',is_admin:0,password:'untouched',auth_session_version:'untouched'});
    expect(f.prisma.$transaction).toHaveBeenCalledOnce();
    for(const [call] of f.tx.users.updateMany.mock.calls) expect(Object.keys(call.data).sort()).toEqual(['auth_session_version','password']);
  });
  it.each(['database','marker','missing','username','admin'])('refuses incorrect %s before updating', async kind => {
    const f=fixture();
    if(kind==='database') f.tx.$queryRaw.mockReset().mockResolvedValue([{database:'production'}]);
    if(kind==='marker') f.tx.site_settings.findUnique.mockResolvedValue(null as any);
    if(kind==='missing') f.rows().splice(1,1);
    if(kind==='username') f.rows()[0].userName='Preview';
    if(kind==='admin') f.rows()[1].is_admin=1;
    await expect(resetPreviewLogin(f.prisma,environment())).rejects.toThrow();
    expect(f.tx.users.updateMany).not.toHaveBeenCalled();
  });
  it('rolls back the first reset if the second account update fails', async () => {
    const f=fixture(); const before=structuredClone(f.rows());
    f.tx.users.updateMany.mockImplementationOnce(async ({data}:any)=>{Object.assign(f.rows()[0],data);return {count:1};}).mockResolvedValueOnce({count:0});
    await expect(resetPreviewLogin(f.prisma,environment())).rejects.toThrow();
    expect(f.rows()).toEqual(before);
  });
});
