import 'server-only';
import {cache} from 'react';
import {redirect} from 'next/navigation';
import {cookies,headers} from 'next/headers';
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {getSession,type SessionPayload} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {ensureSchema} from '@/data/schema-sync';
import {permissionKeySet,pagePermission} from './catalog';
import {readAccess,type Actor} from './store';

/** React cache lives for this server request only; grants never live in the JWT. */
export const readActorAccess=cache(async(userId:number)=>{
  try {
    if(!Number.isSafeInteger(userId)||userId<=0)return {ready:false,keys:new Set<string>(),roles:[]};
    await ensureSchema();
    return await readAccess(prisma,userId);
  }catch{return {ready:false,keys:new Set<string>(),roles:[]};}
});
export async function hasAccess(userId:number,module:string,action='view'):Promise<boolean>{
  const key=`${module}:${action}`;
  if(!permissionKeySet.has(key))return false;
  const access=await readActorAccess(userId);
  return access.ready&&access.keys.has(key);
}
export async function requireAccess(module:string,action='view'):Promise<SessionPayload>{
  const session=await getSession();
  if(!session)redirect('/login');
  if(!(await hasAccess(session.uid,module,action)))redirect('/account?access=denied');
  return session;
}
export async function requireAdminPage(path:string,query?:{section?:string;tab?:string}){
  const key=pagePermission(path,query);
  if(!key)redirect('/account?access=denied');
  const [module,action]=key.split(':');
  return requireAccess(module,action);
}
/** Metadata describes the request; forwarded IP is recorded, never trusted for auth. */
export async function accessActor(session:SessionPayload):Promise<Actor>{
  const [h,c]=await Promise.all([headers(),cookies()]);
  const candidate=(h.get('x-forwarded-for')?.split(',')[0]||h.get('x-real-ip')||'').trim();
  const token=c.get('trbhh_session')?.value;
  return {userId:session.uid,ip:isIP(candidate)?candidate:null,sessionFingerprint:token?createHash('sha256').update(token).digest('hex'):null};
}
