import {beforeEach,describe,expect,it,vi} from 'vitest';
const addresses=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/commerce/address-book',()=>({listMemberAddresses:addresses}));
import {getCjDestinationZip} from '@/lib/cj/destination';
beforeEach(()=>{addresses.mockReset();});
describe('CJ member destination',()=>{
  it('reads only the requested member and prioritizes their default address',async()=>{
    addresses.mockResolvedValue([{isDefault:false,snapshot:{postalCode:'11564'}},{isDefault:true,snapshot:{postalCode:'23455'}}]);
    expect(await getCjDestinationZip(9)).toBe('23455');expect(addresses).toHaveBeenCalledExactlyOnceWith(9n);
  });
  it.each([[],[{isDefault:true,snapshot:{postalCode:'bad'}}]].map(rows=>({rows})))('does not invent a member postal code for invalid or absent data',async({rows})=>{
    addresses.mockResolvedValue(rows);expect(await getCjDestinationZip(9)).toBeUndefined();
  });
  it('propagates address lookup failures rather than pretending a default destination is verified',async()=>{
    addresses.mockRejectedValue(Error('offline'));await expect(getCjDestinationZip(9)).rejects.toThrow('offline');
  });
});
