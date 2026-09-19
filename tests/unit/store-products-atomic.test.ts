import {beforeEach, describe, expect, it, vi} from 'vitest';

const db = vi.hoisted(() => ({stores:{findFirst:vi.fn()},ads:{findMany:vi.fn()},store_products:{deleteMany:vi.fn(),createMany:vi.fn()},$transaction:vi.fn(),$queryRaw:vi.fn()}));
vi.mock('@/lib/prisma', () => ({prisma:db}));
vi.mock('@/data/schema-sync', () => ({ensureSchema:async()=>{}}));
vi.mock('@/lib/profiles', () => ({getActiveProfile:async()=>({type:'store',storeId:7})}));
vi.mock('@/lib/redis', () => ({cached:vi.fn()}));
vi.mock('@/lib/settings', () => ({getStoreSubPricing:vi.fn()}));
import {setStoreProducts} from '@/lib/merchant';

let memberships: {store_id:number;ad_id:number}[];
beforeEach(() => {
  vi.resetAllMocks();
  memberships=[{store_id:7,ad_id:10},{store_id:8,ad_id:30}];
  db.stores.findFirst.mockResolvedValue({id:7n});
  db.$queryRaw.mockResolvedValue([{user_id:5}]);
  db.ads.findMany.mockImplementation(async ({where}) => [11n,12n].filter(id=>where.id.in.includes(id)).map(id=>({id})));
  db.store_products.deleteMany.mockImplementation(async ({where}) => {memberships=memberships.filter(row=>row.store_id!==where.store_id);return {count:1};});
  db.store_products.createMany.mockImplementation(async ({data}) => {memberships.push(...data);return {count:data.length};});
  db.$transaction.mockImplementation(async work => {const before=structuredClone(memberships);try{return await work({ads:db.ads,store_products:db.store_products,$queryRaw:db.$queryRaw});}catch(error){memberships=before;throw error;}});
});

describe('atomic store product selection', () => {
  it.each([{rows:[]},{rows:[{user_id:6}]}])('rejects a removed or transferred store inside the transaction', async ({rows}) => {
    db.$queryRaw.mockResolvedValue(rows);
    await expect(setStoreProducts(5,[])).rejects.toThrow();
    expect(db.ads.findMany).not.toHaveBeenCalled();
    expect(db.store_products.deleteMany).not.toHaveBeenCalled();
    expect(memberships).toEqual([{store_id:7,ad_id:10},{store_id:8,ad_id:30}]);
  });
  it('waits for the parameterized store row lock before querying or replacing products', async () => {
    let release!: (rows:{user_id:number}[])=>void;
    db.$queryRaw.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
    const saving=setStoreProducts(5,[11]);
    await vi.waitFor(()=>expect(db.$queryRaw).toHaveBeenCalledOnce());
    const [sql,...values]=db.$queryRaw.mock.calls[0];
    expect(sql.join('?')).toMatch(/SELECT user_id FROM stores WHERE id = \? FOR UPDATE/);
    expect(values).toEqual([7n]);
    expect(db.ads.findMany).not.toHaveBeenCalled();
    expect(db.store_products.deleteMany).not.toHaveBeenCalled();
    release([{user_id:5}]); await saving;
    expect(memberships).toEqual([{store_id:8,ad_id:30},{store_id:7,ad_id:11}]);
  });
  it('propagates lock failure without deleting any products', async () => {
    db.$queryRaw.mockRejectedValue(new Error('lock timeout'));
    await expect(setStoreProducts(5,[11])).rejects.toThrow('lock timeout');
    expect(db.store_products.deleteMany).not.toHaveBeenCalled();
  });
  it.each([[Number.MAX_SAFE_INTEGER+1],[11,Number.MAX_SAFE_INTEGER+1]])('rejects unsafe integer selections rather than clearing or partially saving', async (...ids) => {
    await expect(setStoreProducts(5,ids)).rejects.toThrow();
    expect(db.store_products.deleteMany).not.toHaveBeenCalled();
    expect(db.ads.findMany).not.toHaveBeenCalled();
  });
  it('propagates ownership query failure before deleting anything', async () => {
    db.ads.findMany.mockRejectedValue(new Error('lookup failed'));
    await expect(setStoreProducts(5,[11])).rejects.toThrow('lookup failed');
    expect(db.store_products.deleteMany).not.toHaveBeenCalled();
    expect(memberships).toEqual([{store_id:7,ad_id:10},{store_id:8,ad_id:30}]);
  });
  it('rolls back deletion when inserting the replacement fails', async () => {
    db.store_products.createMany.mockRejectedValue(new Error('insert failed'));
    await expect(setStoreProducts(5,[11])).rejects.toThrow('insert failed');
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(memberships).toEqual([{store_id:7,ad_id:10},{store_id:8,ad_id:30}]);
  });
  it('propagates deletion failure without inserting', async () => {
    db.store_products.deleteMany.mockRejectedValue(new Error('delete failed'));
    await expect(setStoreProducts(5,[11])).rejects.toThrow('delete failed');
    expect(db.store_products.createMany).not.toHaveBeenCalled();
  });
  it('intentionally clears an empty selection in a transaction without querying ads', async () => {
    await setStoreProducts(5,[]);
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.ads.findMany).not.toHaveBeenCalled();
    expect(db.store_products.createMany).not.toHaveBeenCalled();
    expect(memberships).toEqual([{store_id:8,ad_id:30}]);
  });
  it('deduplicates valid IDs and inserts only ads returned by the owner-scoped query', async () => {
    await setStoreProducts(5,[11,11,12,99,0,-1,1.5,NaN,Infinity]);
    expect(db.ads.findMany).toHaveBeenCalledWith({where:{user_id:5n,id:{in:[11n,12n,99n]}},select:{id:true}});
    expect(memberships).toEqual([{store_id:8,ad_id:30},{store_id:7,ad_id:11},{store_id:7,ad_id:12}]);
    expect(db.$transaction).toHaveBeenCalledOnce();
  });
  it('limits the deduplicated selection to 500 IDs', async () => {
    await setStoreProducts(5,Array.from({length:510},(_,i)=>i+1));
    expect(db.ads.findMany.mock.calls[0][0].where.id.in).toHaveLength(500);
  });
  it('does not touch products when the user has no store', async () => {
    db.stores.findFirst.mockResolvedValue(null);
    await setStoreProducts(5,[11]);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.store_products.deleteMany).not.toHaveBeenCalled();
  });
});
