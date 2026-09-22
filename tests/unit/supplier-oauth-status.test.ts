import {describe,expect,it} from 'vitest';
import {resolveSupplierOAuthStatus} from '@/lib/suppliers/oauth-status';

const now=new Date('2026-09-22T12:00:00Z');

describe('supplier OAuth status',()=>{
 it('shows the five operator states from durable profile and connection data',()=>{
  expect(resolveSupplierOAuthStatus({inviteExpiresAt:null,connection:null},now).key).toBe('unauthorized');
  expect(resolveSupplierOAuthStatus({inviteExpiresAt:new Date('2026-09-22T13:00:00Z'),connection:null},now).key).toBe('pending');
  expect(resolveSupplierOAuthStatus({inviteExpiresAt:new Date('2026-09-22T11:00:00Z'),connection:null},now).key).toBe('expired');
  expect(resolveSupplierOAuthStatus({inviteExpiresAt:null,connection:{status:'connected',scopeVersion:1,hasTokens:true}},now).key).toBe('authorized');
  expect(resolveSupplierOAuthStatus({inviteExpiresAt:new Date('2026-09-22T13:00:00Z'),connection:{status:'reconnect_required',scopeVersion:1,hasTokens:false}},now).key).toBe('pending');
  expect(resolveSupplierOAuthStatus({inviteExpiresAt:null,connection:{status:'reconnect_required',scopeVersion:1,hasTokens:false}},now).key).toBe('reauthorization_required');
  expect(resolveSupplierOAuthStatus({inviteExpiresAt:null,connection:{status:'connected',scopeVersion:0,hasTokens:true}},now).key).toBe('reauthorization_required');
 });
});
