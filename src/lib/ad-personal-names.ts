import 'server-only';
import {prisma} from './prisma';
type AdIdentity={id:bigint;user_id:bigint;profile_id?:bigint|null};
/** Match details: primary profiles use the live account name; additional identities keep their name. */
export async function getAdPersonalNames(rows:AdIdentity[]):Promise<Map<number,string>>{
 const ids=[...new Set(rows.flatMap(row=>row.profile_id?[row.profile_id]:[]))];
 const names=new Map<number,string>();
 if(!ids.length)return names;
 const profiles=await prisma.profiles.findMany({where:{id:{in:ids},type:'personal',is_default:0},select:{id:true,user_id:true,name:true}});
 const byId=new Map(profiles.map(profile=>[profile.id,profile]));
 for(const row of rows){
  const profile=row.profile_id?byId.get(row.profile_id):undefined;
  if(profile?.user_id===row.user_id&&profile.name?.trim())names.set(Number(row.id),profile.name.trim());
 }
 return names;
}
