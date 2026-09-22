import 'server-only';
import {getPrimaryAdminIdStrict} from './admin-inbox';
import {hasAccess} from './access-control/guards';
/** The support inbox is organizational data even when its UID owns the row.
 * Ordinary members keep their own conversations and may contact support. */
export async function canUseMemberChat(userId:number,action:'view'|'create'|'delete'|'edit'='view'):Promise<boolean>{
  try{
    if(!Number.isSafeInteger(userId)||userId<=0)return false;
    const adminId=await getPrimaryAdminIdStrict();
    if(userId!==adminId)return true;
    if(!await hasAccess(userId,'messages','view'))return false;
    return action==='view'||await hasAccess(userId,'messages',action);
  }catch{return false;}
}
