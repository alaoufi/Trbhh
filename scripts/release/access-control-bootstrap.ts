import {PrismaClient} from '@prisma/client';
import {initializeAccessControl,readAccess} from '@/lib/access-control/store';

/** Operator-only, explicitly invoked before switching a deployment to RBAC. */
export async function main(args=process.argv.slice(2)):Promise<number>{
  if(args.length!==4||args[0]!=='--apply'||args[1]!=='--actor'||!/^\d+$/.test(args[2])||args[3]!=='--grant-access-management'){
    console.error('Usage: node access-control-bootstrap.cjs --apply --actor EXISTING_ADMIN_ID --grant-access-management');return 2;
  }
  const userId=Number(args[2]);if(!Number.isSafeInteger(userId)||userId<=0)return 2;
  const db=new PrismaClient({log:[]});
  try{
    await initializeAccessControl(db,{userId,ip:null,sessionFingerprint:null},[userId]);
    const access=await readAccess(db,userId);
    if(!access.ready)throw new Error('access_not_initialized');
    console.info(JSON.stringify({ready:true,actorId:userId,roles:access.roles.map(r=>r.id),permissionCount:access.keys.size,financialSensitiveDefaults:false}));
    return 0;
  }catch(error){
    // No database URLs, credentials, SQL, user records, or raw error messages.
    const code=error instanceof Error&&/^access_[a-z_]+$/.test(error.message)?error.message:'access_bootstrap_failed';
    console.error(code);return 1;
  }finally{await db.$disconnect();}
}
