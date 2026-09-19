import { describe, expect, it, vi } from 'vitest';
import { createPreviewServerStorage, PREVIEW_STATE_KEYS } from '../../preview-v2/lib/preview-server-storage';
import { capturePreviewStorage, installPreviewStorage, persistLocal, readLocal, writeLocal } from '../../preview-v2/lib/preview';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const loaded = (values: Record<string,unknown>) => new Response(JSON.stringify({ownerId:11,values,revisions:Object.fromEntries(Object.keys(values).map(key=>[key,1]))}));
const saved = (revision=2) => new Response(JSON.stringify({revision}));

describe('sandbox confirmed storage', () => {
  it('binds writes to the hydrated owner when another tab changes accounts with matching revisions', async () => {
    let sessionOwner = 11;
    const writes: unknown[] = [];
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method !== 'PUT') return loaded({'ad-draft-v1':'old'});
      const body = JSON.parse(String(init.body));
      if (body.ownerId !== sessionOwner) return new Response(null,{status:403});
      writes.push(body.value); return saved();
    });
    const storage = createPreviewServerStorage(fetcher); await storage.hydrate();
    sessionOwner = 22;
    await expect(storage.write('ad-draft-v1','account 11 edits')).rejects.toMatchObject({status:403});
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).ownerId).toBe(11);
    expect(writes).toEqual([]);
    expect(storage.read('ad-draft-v1',null)).toBe('old');
  });
  it.each([undefined, null, '', '11', 0, -1, 1.5])('rejects invalid hydration owner %s', async ownerId => {
    const storage=createPreviewServerStorage(vi.fn().mockResolvedValue(new Response(JSON.stringify({ownerId,values:{},revisions:{}}))));
    await expect(storage.hydrate()).rejects.toMatchObject({status:502});
    await expect(storage.write('ad-draft-v1','old edits')).rejects.toThrow();
  });
  it('never continues a captured publish through a replacement provider', async () => {
    let finish!: () => void;
    const first = {read: <T,>(_key:string,fallback:T)=>fallback, write:vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}))};
    const second = {read: <T,>(_key:string,fallback:T)=>fallback, write:vi.fn(async()=>{})};
    const uninstall = installPreviewStorage(first);
    const operation = capturePreviewStorage('server');
    const publish = (async()=>{await operation.write('ad-draft-v1','draft');await operation.write('seller-ads-v1',[]);await operation.write('ad-draft-v1',null);})();
    const rejected = expect(publish).rejects.toThrow();
    uninstall(); const uninstallSecond=installPreviewStorage(second);
    try {
      finish(); await rejected;
      await expect(operation.write('ad-draft-v1',null)).rejects.toThrow();
      expect(first.write).toHaveBeenCalledTimes(1);
      expect(second.write).not.toHaveBeenCalled();
    } finally {uninstallSecond();}
  });
  it('disposal stops queued writes and rejects in-flight acknowledgement', async () => {
    let finish!: (response:Response)=>void;
    const fetcher=vi.fn().mockResolvedValueOnce(loaded({})).mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=resolve;}));
    const storage=createPreviewServerStorage(fetcher); await storage.hydrate();
    const one=storage.write('ad-draft-v1','one');
    const two=storage.write('seller-ads-v1',[]);
    const rejectedOne=expect(one).rejects.toThrow(); const rejectedTwo=expect(two).rejects.toThrow();
    await Promise.resolve(); storage.dispose(); finish(saved(1));
    await rejectedOne; await rejectedTwo;
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(storage.write('ad-draft-v1',null)).rejects.toThrow();
  });
  it('labels server fields per account and omits the deferred classification link', async () => {
    const {FieldSettingsPreview}=await import('../../preview-v2/components/field-settings-preview');
    const html=renderToStaticMarkup(createElement<{storageMode?:'local'|'server'}>(FieldSettingsPreview,{storageMode:'server'}));
    expect(html).toContain('حسابك');
    expect(html).not.toMatch(/href="\/classification\/?"/);
    expect(html).not.toContain('يمكن لأي زائر');
    expect(renderToStaticMarkup(createElement(FieldSettingsPreview))).toMatch(/href="\/classification\/?"/);
  });
  it('uses new revisions for queued saves and retains the old revision after a conflict', async () => {
    const fetcher=vi.fn().mockResolvedValueOnce(loaded({'ad-draft-v1':'old'}))
      .mockResolvedValueOnce(saved(2)).mockResolvedValueOnce(saved(3)).mockResolvedValueOnce(new Response(null,{status:409}));
    const storage=createPreviewServerStorage(fetcher); await storage.hydrate();
    await Promise.all([storage.write('ad-draft-v1','one'),storage.write('ad-draft-v1','two')]);
    expect(fetcher.mock.calls.slice(1).map(call=>JSON.parse(call[1].body).revision)).toEqual([1,2]);
    await expect(storage.write('ad-draft-v1','conflict')).rejects.toMatchObject({status:409});
    expect(storage.read('ad-draft-v1',null)).toBe('two');
    expect(JSON.parse(fetcher.mock.calls[3][1].body).revision).toBe(3);
  });
  it('fails closed on unauthenticated or invalid hydration and never falls back in server mode', async () => {
    const unauthorized=createPreviewServerStorage(vi.fn().mockResolvedValue(new Response(null,{status:401})));
    await expect(unauthorized.hydrate()).rejects.toMatchObject({status:401});
    expect(()=>unauthorized.read('ad-draft-v1',null)).toThrow();
    const invalid=createPreviewServerStorage(vi.fn().mockResolvedValue(new Response(JSON.stringify({values:{'ad-draft-v1':'text'},revisions:{}}))));
    await expect(invalid.hydrate()).rejects.toMatchObject({status:502});
    await expect(persistLocal('ad-draft-v1',null,'server')).rejects.toThrow();
  });
  it('does not let callers mutate confirmed cached values', async () => {
    const storage=createPreviewServerStorage(vi.fn().mockResolvedValue(loaded({'ad-draft-v1':{title:'original'}})));
    await storage.hydrate(); const value=storage.read('ad-draft-v1',{title:''}); value.title='mutated';
    expect(storage.read('ad-draft-v1',null)).toEqual({title:'original'});
  });
  it('hydrates before reads, allowlists keys and never touches browser storage', async () => {
    const fetcher = vi.fn().mockResolvedValue(loaded({'ad-draft-v1':{title:'server'}}));
    const storage = createPreviewServerStorage(fetcher);
    expect(() => storage.read('ad-draft-v1', null)).toThrow();
    await storage.hydrate();
    expect(storage.read('ad-draft-v1', null)).toEqual({title:'server'});
    expect(PREVIEW_STATE_KEYS).toEqual(['seller-ads-v1','ad-draft-v1','field-settings-v1']);
    expect(storage.read('classifications-v1',{})).toEqual({});
    await expect(storage.write('classifications-v1', {})).rejects.toThrow();
    await expect(storage.write('favorites', [])).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps the confirmed cache unchanged until PUT succeeds and snapshots caller data', async () => {
    let finish!: (value: Response) => void;
    const fetcher = vi.fn().mockResolvedValueOnce(loaded({'ad-draft-v1':{title:'old'}}))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { finish=resolve; }));
    const storage=createPreviewServerStorage(fetcher); await storage.hydrate();
    const value={title:'new'}; const pendingSave=storage.write('ad-draft-v1',value); value.title='mutated';
    await Promise.resolve();
    expect(storage.read('ad-draft-v1',null)).toEqual({title:'old'});
    finish(saved()); await pendingSave;
    expect(storage.read('ad-draft-v1',null)).toEqual({title:'new'});
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ownerId:11,key:'ad-draft-v1',value:{title:'new'},revision:1});
    expect(fetcher.mock.calls[1][0]).toBe('/api/preview-state');
    expect(fetcher.mock.calls[1][1].credentials).toBe('same-origin');
  });
  it('rejects failed writes, retains confirmed state, and allows a later retry', async () => {
    const fetcher=vi.fn().mockResolvedValueOnce(loaded({'ad-draft-v1':'old'}))
      .mockResolvedValueOnce(new Response(null,{status:401})).mockResolvedValueOnce(saved());
    const storage=createPreviewServerStorage(fetcher); await storage.hydrate();
    await expect(storage.write('ad-draft-v1','new')).rejects.toMatchObject({status:401});
    expect(storage.read('ad-draft-v1',null)).toBe('old');
    await storage.write('ad-draft-v1','retry');
    expect(storage.read('ad-draft-v1',null)).toBe('retry');
  });
  it('rejects sync writes in server mode and restores local mode on cleanup', async () => {
    const storage=createPreviewServerStorage(vi.fn().mockResolvedValueOnce(loaded({})).mockResolvedValueOnce(saved(1)));
    await storage.hydrate(); const uninstall=installPreviewStorage(storage);
    try {
      expect(() => writeLocal('ad-draft-v1',null)).toThrow(/persistLocal/);
      await persistLocal('ad-draft-v1',{title:'saved'});
      expect(readLocal('ad-draft-v1',null)).toEqual({title:'saved'});
    } finally {uninstall();}
    const browserStorage={getItem:vi.fn().mockReturnValue(null),setItem:vi.fn()};
    vi.stubGlobal('localStorage',browserStorage);
    try {writeLocal('ad-draft-v1',null);expect(browserStorage.setItem).toHaveBeenCalledWith('trbhh-v2-ad-draft-v1','null');}
    finally {vi.unstubAllGlobals();}
  });
});
