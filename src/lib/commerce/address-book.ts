import 'server-only';
import type {Prisma} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import {assertCommerceSchemaReady} from './schema';
import {normalizeSaudiAddress,type SaudiAddressInput,type SaudiAddressSnapshot} from './addresses';

export type SavedAddress={id:bigint;label:string;isDefault:boolean;snapshot:SaudiAddressSnapshot;updatedAt:Date};
type Row={id:bigint;label:string;is_default:number;snapshot:SaudiAddressSnapshot|string;updated_at:Date};
function view(row:Row):SavedAddress{return{id:row.id,label:row.label,isDefault:Number(row.is_default)===1,snapshot:typeof row.snapshot==='string'?JSON.parse(row.snapshot):row.snapshot,updatedAt:row.updated_at};}
async function lockOwner(tx:Prisma.TransactionClient,memberId:bigint){
  const [owner]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM users WHERE id=${memberId} FOR UPDATE`;
  if(!owner)throw new Error('address_member_invalid');
}

export async function listMemberAddresses(memberId:bigint):Promise<SavedAddress[]>{
  if(memberId<=0n)throw new Error('address_member_invalid');
  await assertCommerceSchemaReady(prisma);
  const rows=await prisma.$queryRaw<Row[]>`SELECT id,label,is_default,snapshot,updated_at FROM commerce_customer_addresses WHERE member_id=${memberId} ORDER BY is_default DESC,updated_at DESC,id DESC`;
  return rows.map(view);
}
export async function saveMemberAddress(memberId:bigint,input:SaudiAddressInput,makeDefault:boolean):Promise<bigint>{
  if(memberId<=0n)throw new Error('address_member_invalid');
  const snapshot=normalizeSaudiAddress(input);
  await assertCommerceSchemaReady(prisma);
  return prisma.$transaction(async tx=>{
    await lockOwner(tx,memberId);
    const rows=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_customer_addresses WHERE member_id=${memberId} FOR UPDATE`;
    const isDefault=makeDefault||rows.length===0;
    if(isDefault)await tx.$executeRaw`UPDATE commerce_customer_addresses SET is_default=0,updated_at=CURRENT_TIMESTAMP(3) WHERE member_id=${memberId}`;
    await tx.$executeRaw`INSERT INTO commerce_customer_addresses (member_id,label,snapshot,is_default) VALUES (${memberId},${snapshot.label},${JSON.stringify(snapshot)},${isDefault?1:0})`;
    const [created]=await tx.$queryRaw<{id:bigint}[]>`SELECT LAST_INSERT_ID() AS id`;
    if(!created?.id)throw new Error('address_save_failed');
    return created.id;
  });
}
export async function setMemberDefaultAddress(memberId:bigint,addressId:bigint):Promise<void>{
  if(memberId<=0n||addressId<=0n)throw new Error('address_invalid');
  await assertCommerceSchemaReady(prisma);
  await prisma.$transaction(async tx=>{
    await lockOwner(tx,memberId);
    const [owned]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_customer_addresses WHERE id=${addressId} AND member_id=${memberId} FOR UPDATE`;
    if(!owned)throw new Error('address_not_found');
    await tx.$executeRaw`UPDATE commerce_customer_addresses SET is_default=0,updated_at=CURRENT_TIMESTAMP(3) WHERE member_id=${memberId}`;
    await tx.$executeRaw`UPDATE commerce_customer_addresses SET is_default=1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=${addressId} AND member_id=${memberId}`;
  });
}
export async function deleteMemberAddress(memberId:bigint,addressId:bigint):Promise<void>{
  if(memberId<=0n||addressId<=0n)throw new Error('address_invalid');
  await assertCommerceSchemaReady(prisma);
  await prisma.$transaction(async tx=>{
    await lockOwner(tx,memberId);
    const [existing]=await tx.$queryRaw<{id:bigint;is_default:number}[]>`SELECT id,is_default FROM commerce_customer_addresses WHERE id=${addressId} AND member_id=${memberId} FOR UPDATE`;
    if(!existing)throw new Error('address_not_found');
    await tx.$executeRaw`DELETE FROM commerce_customer_addresses WHERE id=${addressId} AND member_id=${memberId}`;
    if(Number(existing.is_default)===1){
      const [next]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_customer_addresses WHERE member_id=${memberId} ORDER BY updated_at DESC,id DESC LIMIT 1`;
      if(next)await tx.$executeRaw`UPDATE commerce_customer_addresses SET is_default=1 WHERE id=${next.id} AND member_id=${memberId}`;
    }
  });
}
export async function getMemberAddress(memberId:bigint,addressId:bigint):Promise<SavedAddress|null>{
  if(memberId<=0n||addressId<=0n)throw new Error('address_invalid');
  await assertCommerceSchemaReady(prisma);
  const [row]=await prisma.$queryRaw<Row[]>`SELECT id,label,is_default,snapshot,updated_at FROM commerce_customer_addresses WHERE id=${addressId} AND member_id=${memberId} LIMIT 1`;
  return row?view(row):null;
}
