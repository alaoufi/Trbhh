import 'server-only';
import type { CommerceGateway } from './gateway';

/** No production commerce adapter is registered until the bank's currency,
 * PaymentID/TrackID contract and authorized sandbox acceptance are verified.
 * Existing wallet payment adapters are intentionally not registered here.
 */
export async function getCommerceGateway(): Promise<CommerceGateway | null> { return null; }
