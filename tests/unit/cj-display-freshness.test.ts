import {describe,expect,it,vi} from 'vitest';
import {createDisplayReadCache,quoteMatchesSelection,isLiveDisplayPayload,createDisplayReadQueue} from '@/lib/cj/display-freshness';

describe('CJ display reads and quantity identity',()=>{
  it('limits passive reads to one active request and recovers after a failure',async()=>{
    const schedule=createDisplayReadQueue();let release!:()=>void;
    const first=schedule(()=>new Promise<void>(resolve=>{release=resolve;}));
    const next=vi.fn(async()=>7);const second=schedule(next);
    await Promise.resolve();expect(next).not.toHaveBeenCalled();release();await first;expect(await second).toBe(7);
    await expect(schedule(async()=>{throw Error('offline');})).rejects.toThrow('offline');
    expect(await schedule(async()=>8)).toBe(8);
  });
  it('does not display malformed amounts, stock, total or verification time',()=>{
    const valid={status:'available',priceMinor:1234,shipMinor:700,stock:4,totalMinor:1934,checkedAt:'2026-10-13T00:00:00Z'};
    expect(isLiveDisplayPayload(valid)).toBe(true);
    for(const change of [{priceMinor:NaN},{shipMinor:-1},{stock:2.5},{stock:0},{totalMinor:1935},{checkedAt:'invalid'}])expect(isLiveDisplayPayload({...valid,...change})).toBe(false);
  });
  it('does not retain unsuccessful display snapshots',async()=>{
    const cache=createDisplayReadCache<{status:string}>(30,Date.now,200,value=>value.status==='available');
    await cache.read('p',async()=>({status:'unavailable'}));
    expect(await cache.read('p',async()=>({status:'available'}))).toEqual({status:'available'});
  });
  it('shares concurrent reads but starts expiry after a successful reply',async()=>{
    let clock=0;const cache=createDisplayReadCache<number>(30,()=>clock);
    let resolve!:(value:number)=>void;const read=vi.fn(()=>new Promise<number>(r=>{resolve=r;}));
    const first=cache.read('pid',read),second=cache.read('pid',read);
    expect(read).toHaveBeenCalledTimes(1);clock=100;resolve(7);
    expect(await first).toBe(7);expect(await second).toBe(7);
    clock=129;expect(await cache.read('pid',read)).toBe(7);
    clock=130;const fresh=cache.read('pid',async()=>9);expect(await fresh).toBe(9);
  });
  it('does not preserve errors and separates products and destination keys',async()=>{
    const cache=createDisplayReadCache<number>(30);
    await expect(cache.read('p|11564',async()=>{throw Error('offline');})).rejects.toThrow('offline');
    expect(await cache.read('p|11564',async()=>1)).toBe(1);
    expect(await cache.read('p|23455',async()=>2)).toBe(2);
    expect(await cache.read('other|11564',async()=>3)).toBe(3);
  });
  it('can bypass a settled snapshot while still sharing an active verification',async()=>{
    const cache=createDisplayReadCache<number>(30);
    expect(await cache.read('p',async()=>1)).toBe(1);
    expect(await cache.read('p',async()=>2,true)).toBe(2);
  });
  it('rejects a previous quantity or variant before displaying or adding its quote',()=>{
    const checked={productId:12,vid:'blue',quantity:1};
    expect(quoteMatchesSelection(checked,12,'blue',1)).toBe(true);
    expect(quoteMatchesSelection(checked,12,'blue',2)).toBe(false);
    expect(quoteMatchesSelection(checked,12,'red',1)).toBe(false);
    expect(quoteMatchesSelection(checked,13,'blue',1)).toBe(false);
    expect(quoteMatchesSelection(null,12,'blue',1)).toBe(false);
  });
});
