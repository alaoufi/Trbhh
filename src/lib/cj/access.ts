import 'server-only';
import { hasAccess } from '@/lib/access-control/guards';
import { isActiveAgent } from './agents';

/** Staff capabilities remain independent; an active assigned agent manages only that product. */
export async function cjProductCapabilities(userId: number, agentUserId: bigint | null) {
  const agent = agentUserId === BigInt(userId) && await isActiveAgent(userId);
  const view = await hasAccess(userId, 'products', 'view');
  const [edit, suspend, remove] = await Promise.all(['edit', 'suspend', 'delete'].map(action => view && hasAccess(userId, 'products', action)));
  return { agent, edit: agent || edit, suspend: agent || suspend, delete: agent || remove };
}
