import {describe,it,expect,vi} from 'vitest';
import {SallaAdapter,mapSallaProduct} from '@/lib/suppliers/providers/salla';

const raw=()=>({id:123,name:'Product',sku:'sku',description:'<p>Hello</p><script>secret()</script>',price:{amount:50,currency:'SAR'},quantity:10,status:'sale',is_available:true,images:[{url:'https://cdn.salla.sa/item.jpg'},{url:'http://localhost/x'}],categories:[{id:3,name:'Category'}],brand:{name:'Brand'},options:[{id:4,name:'Size',values:[{id:5,name:'Large'}]}],skus:[{id:6,sku:'large',price:{amount:47,currency:'SAR'},stock_quantity:2,related_options:[4],related_option_values:[5]}]});
describe('Salla read-only adapter',()=>{
  it('maps exact SAR, variants/options and plain allowlisted data',()=>{
    const p=mapSallaProduct({...raw(),cost_price:1,access_token:'secret'});
    expect(p).toMatchObject({externalId:'123',publicPriceMinor:5000,description:'Hello',brand:'Brand',images:['https://cdn.salla.sa/item.jpg']});
    expect(p.variants[0]).toMatchObject({externalId:'6',publicPriceMinor:4700,quantity:2,options:{Size:'Large'}});
    expect(JSON.stringify(p)).not.toMatch(/secret|cost_price|access_token/);
  });
  it.each(['USD',''])('rejects unsupported currency %s',currency=>expect(()=>mapSallaProduct({...raw(),price:{amount:1,currency}})).toThrow());
  it.each([-1,1.001,Infinity,21474836.48])('rejects unsafe amount %s',amount=>expect(()=>mapSallaProduct({...raw(),price:{amount,currency:'SAR'}})).toThrow());
  it('unknown/unlimited quantity is not invented stock',()=>{
    expect(mapSallaProduct({...raw(),unlimited_quantity:true}).quantity).toBeNull();
    expect(mapSallaProduct({...raw(),quantity:undefined}).quantity).toBeNull();
  });
  it('accepts documented timezone-less timestamp without inventing an instant',()=>{
    expect(mapSallaProduct({...raw(),updated_at:'2024-03-06 13:50:32'}).sourceUpdatedAt).toBeNull();
    expect(mapSallaProduct({...raw(),updated_at:{date:'2024-03-06 13:50:32.000000',timezone:'Asia/Riyadh'}}).sourceUpdatedAt).toBe('2024-03-06T10:50:32.000Z');
  });
  it('constructs pagination locally, omits credentials and rejects redirects',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({success:true,data:[raw()],pagination:{currentPage:1,totalPages:2,links:{next:'https://evil.example/token'}}})));
    const adapter=new SallaAdapter(async()=>'private-token',fetcher);
    expect((await adapter.getProducts()).nextCursor).toBe('2');
    expect(fetcher.mock.calls[0][0]).toBe('https://api.salla.dev/admin/v2/products?page=1&per_page=50');
    expect(fetcher.mock.calls[0][1]).toMatchObject({method:'GET',credentials:'omit',redirect:'error',cache:'no-store'});
  });
  it('never leaks upstream error bodies and never posts orders',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response('private-token customer',{status:401}));
    const adapter=new SallaAdapter(async()=>'token',fetcher);
    await expect(adapter.getProduct('123')).rejects.toThrow('salla_http_401');
    await expect(adapter.createOrder()).rejects.toThrow('unsupported_live_order_contract');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects path injection before requesting',async()=>{
    const fetcher=vi.fn();const adapter=new SallaAdapter(async()=>'token',fetcher);
    await expect(adapter.getProduct('../oauth')).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects incomplete pagination metadata instead of reporting completion',async()=>{
    const adapter=new SallaAdapter(async()=>'token',vi.fn().mockResolvedValue(new Response(JSON.stringify({success:true,data:[raw()]}))));
    await expect(adapter.getProducts()).rejects.toThrow('salla_pagination');
  });
  it('reads tracking separately without retaining customer/addresses or payment-method assumptions',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({success:true,data:{id:123,status:{slug:'in_progress'},currency:'SAR',amounts:{total:{amount:47,currency:'SAR'}},payment_method:'credit_card',customer:{email:'private@example.com'},shipping_status:'shipped'}})))
      .mockResolvedValueOnce(new Response(JSON.stringify({success:true,data:[{id:99,order_id:123,courier_name:'DHL',tracking_number:'tracking',status:'in_transit',ship_to:{phone:'private'}}],pagination:{currentPage:1,totalPages:1}})));
    const order=await new SallaAdapter(async()=>'token',fetcher).getOrder('123');
    expect(order).toMatchObject({externalId:'123',payableMinor:4700,paymentStatus:'unknown',shipments:[{externalId:'99',trackingNumber:'tracking'}]});
    expect(JSON.stringify(order)).not.toContain('private');
    expect(fetcher.mock.calls[1][0]).toBe('https://api.salla.dev/admin/v2/shipments?order_id=123&page=1&per_page=60');
  });
  it('404 returns null but mismatched resource IDs fail closed',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response('',{status:404})).mockResolvedValueOnce(new Response(JSON.stringify({success:true,data:raw()})));
    const adapter=new SallaAdapter(async()=>'token',fetcher);
    expect(await adapter.getProduct('123')).toBeNull();await expect(adapter.getProduct('456')).rejects.toThrow('salla_resource_mismatch');
  });
  it('bounds response bytes before parsing',async()=>{
    const adapter=new SallaAdapter(async()=>'token',vi.fn().mockResolvedValue(new Response('x'.repeat(2*1024*1024+1))));
    await expect(adapter.getProduct('123')).rejects.toThrow('salla_response_too_large');
  });
  it('rejects unsafe images and returns exact zero price',()=>{
    const p=mapSallaProduct({...raw(),price:{amount:0,currency:'SAR'},images:[{url:'https://127.0.0.1/a'},{url:'https://user:pass@cdn.salla.sa/a'},{url:'https://cdn.salla.sa.evil.example/a'}]});
    expect(p.publicPriceMinor).toBe(0);expect(p.images).toEqual([]);
  });
  it('rejects list limits exceeding the documented 60 before network',async()=>{
    const fetcher=vi.fn();await expect(new SallaAdapter(async()=>'token',fetcher).getProducts({limit:61})).rejects.toThrow('salla_pagination');expect(fetcher).not.toHaveBeenCalled();
  });
});
