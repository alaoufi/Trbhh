import {describe,expect,it} from 'vitest';
import {NextRequest} from 'next/server';
import {middleware} from '@/middleware';
import {primaryOrigin} from '@/lib/public-origin';
describe('protected administration cache headers',()=>{
 it.each(['/admin','/admin/finance','/admin/access-control','/admin/finance/export'])('keeps anonymous administration response %s private and uncached before streamed login redirects',path=>{
  const response=middleware(new NextRequest(primaryOrigin+path));
  expect(response.headers.get('cache-control')).toBe('private, no-store, must-revalidate');
  expect(response.headers.get('vary')).toContain('Cookie');
 });
 it('does not classify a public path with a similar prefix as administration',()=>{
  const response=middleware(new NextRequest(primaryOrigin+'/administrator'));
  expect(response.headers.get('cache-control')).toBe('no-store, must-revalidate');
 });
 it('preserves private caching policy for authenticated public pages',()=>{
  const response=middleware(new NextRequest(primaryOrigin+'/',{headers:{cookie:'trbhh_session=test'}}));
  expect(response.headers.get('cache-control')).toBe('private, no-store, must-revalidate');
 });
});
