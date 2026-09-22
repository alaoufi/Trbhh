import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEPARTMENTS, PERMISSIONS, canAccessPage, pagePermission } from '@/lib/access-control/catalog';
import { ADMIN_GROUPS, ADMIN_NAV } from '@/components/admin-nav-def';
const state = vi.hoisted(() => ({session:vi.fn(),access:vi.fn(),has:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSession:state.session}));
vi.mock('@/lib/access-control/guards',()=>({hasAccess:state.has,readActorAccess:state.access}));
import {AccessBoundary, AccessPage} from '@/components/access-boundary';
describe('registered admin navigation and presentation boundaries',()=>{
 it('offers exactly ten departments and no unregistered navigation destinations',()=>{
  expect(ADMIN_GROUPS.map(group=>group.key)).toEqual(DEPARTMENTS.map(department=>department.id));
  expect(ADMIN_GROUPS.every(group=>group.items.length>0)).toBe(true);
  expect(ADMIN_NAV.every(item=>PERMISSIONS.some(permission=>permission.key===pagePermission(item.href)))).toBe(true);
 });
 it('keeps view-only users away from unrelated department links',()=>{
  const keys=new Set(['users:view']);
  expect(ADMIN_NAV.filter(item=>canAccessPage(keys,item.href)).every(item=>pagePermission(item.href)==='users:view')).toBe(true);
  expect(canAccessPage(keys,'/admin/access-control')).toBe(false);
  expect(canAccessPage(keys,'/admin/finance')).toBe(false);
 });
 it('checks the exact mutation grant independently of page visibility',async()=>{
  state.session.mockResolvedValue({uid:7});state.has.mockResolvedValue(false);
  const children=createElement('button',null,'approve');
  expect(await AccessBoundary({module:'settlements',action:'approve',children})).toBeNull();
  expect(state.has).toHaveBeenCalledWith(7,'settlements','approve');
  state.has.mockResolvedValue(true);
  expect(renderToStaticMarkup(await AccessBoundary({module:'settlements',action:'approve',children}))).toContain('approve');
 });
 it('never renders a cross-domain link when its registered view grant is absent',async()=>{
  state.session.mockResolvedValue({uid:7});state.access.mockResolvedValue({keys:new Set(['users:view'])});
  expect(await AccessPage({href:'/admin/revenue?tab=wallets',children:'private wallet'})).toBeNull();
  expect(renderToStaticMarkup(await AccessPage({href:'/admin/users/42',children:'user profile'}))).toBe('user profile');
 });
});
