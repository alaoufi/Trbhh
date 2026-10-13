import 'server-only';
import {listMemberAddresses} from '@/lib/commerce/address-book';

/** Read only the signed-in member's destination; no client-supplied account ID. */
export async function getCjDestinationZip(memberId:number):Promise<string|undefined>{
  const address=await getCjDestinationAddress(memberId);
  return address?.postalCode;
}

export async function getCjDestinationAddress(memberId:number){
  const addresses=await listMemberAddresses(BigInt(memberId));
  const address=addresses.find(row=>row.isDefault)??addresses[0];
  const zip=address?.snapshot.postalCode?.trim();
  return zip&&/^\d{5}$/.test(zip)?{...address!.snapshot,postalCode:zip}:null;
}
