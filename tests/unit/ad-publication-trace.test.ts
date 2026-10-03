import {describe,it,expect} from 'vitest';
import {createPublishTrace,publicationOutcome,safePublicationDiagnostic} from '@/lib/ads/publication-trace';
describe('publication trace',()=>{
  it('keeps actionable error classification and function frames without messages or paths',()=>{
    const error=Object.assign(new Error('mysql://root:SECRET@host/db'),{code:'P2002'});
    error.stack='Error: SECRET\n    at storeImages (/private/SECRET.ts:42:3)';
    expect(safePublicationDiagnostic(error)).toEqual({kind:'Error',code:'P2002',frames:'storeImages'});
    expect(JSON.stringify(safePublicationDiagnostic(error))).not.toContain('SECRET');
  });
  it('assigns one terminal outcome and never logs content or arbitrary properties',()=>{
    const logs:string[]=[];
    const trace=createPublishTrace(line=>logs.push(line));
    trace.stage('AUTH_OK',{userId:1,title:'private',password:'secret'} as never);
    trace.outcome('PUBLIC_NOW');trace.finish();trace.finish();
    expect(logs.join('')).not.toMatch(/private|secret|password|title/);
    expect(logs.map(line=>JSON.parse(line)).filter(row=>row.outcome)).toHaveLength(1);
    expect(trace.id).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('marks an interrupted attempt rejected without inventing a success',()=>{
    const logs:string[]=[];const trace=createPublishTrace(line=>logs.push(line));trace.finish();
    expect(JSON.parse(logs.at(-1)!).outcome).toBe('REJECTED');
  });
  it('derives outcome from actual publication state, not submitted success flags',()=>{
    const ad={status:1,state:'active',store_only:0,publish_at:null};
    expect(publicationOutcome(ad,true)).toBe('PUBLIC_NOW');
    expect(publicationOutcome(ad,false)).toBe('REJECTED');
    expect(publicationOutcome({...ad,status:0},false)).toBe('PENDING_APPROVAL');
    expect(publicationOutcome({...ad,status:0,publish_at:new Date('2099-01-01')},false)).toBe('SCHEDULED');
    expect(publicationOutcome({...ad,store_only:1},false)).toBe('STORE_ONLY');
    expect(publicationOutcome({...ad,state:'deleted'},false)).toBe('REJECTED');
  });
});
