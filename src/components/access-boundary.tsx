import { getSession } from '@/lib/auth';
import { hasAccess } from '@/lib/access-control/guards';
/** Presentation gate only; mutation handlers independently verify authorization. */
export async function AccessBoundary({ module, action = 'view', children }: { module: string; action?: string; children: React.ReactNode }) {
  const session = await getSession();
  if (!session || !await hasAccess(session.uid, module, action)) return null;
  return <>{children}</>;
}

import { readActorAccess } from '@/lib/access-control/guards';
import { canAccessPage } from '@/lib/access-control/catalog';
export async function AccessPage({href,children}:{href:string;children:React.ReactNode}){
 const session=await getSession();
 if(!session||!canAccessPage((await readActorAccess(session.uid)).keys,href))return null;
 return <>{children}</>;
}
