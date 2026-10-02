import {afterEach,describe,expect,it,vi} from 'vitest';
import {resolveGoogleMapsCoordinates} from '@/lib/maps-server';

afterEach(()=>vi.unstubAllGlobals());

describe('secure Google Maps short-link resolution',()=>{
  it('accepts direct coordinates without a network request',async()=>{
    const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
    await expect(resolveGoogleMapsCoordinates('https://www.google.com/maps/@24.7136,46.6753,15z')).resolves.toEqual({lat:24.7136,lng:46.6753});
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects a redirect to an untrusted or internal host',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}})));
    await expect(resolveGoogleMapsCoordinates('https://maps.app.goo.gl/example')).resolves.toBeNull();
  });
  it('follows only allowlisted HTTPS redirects and extracts coordinates',async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response(null,{status:302,headers:{location:'https://www.google.com/maps/@24.7136,46.6753,15z'}}));
    vi.stubGlobal('fetch',fetchMock);
    await expect(resolveGoogleMapsCoordinates('https://maps.app.goo.gl/example')).resolves.toEqual({lat:24.7136,lng:46.6753});
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL),expect.objectContaining({redirect:'manual'}));
  });
});
