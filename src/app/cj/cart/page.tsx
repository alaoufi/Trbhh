import {requireAccess} from '@/lib/access-control/guards';
import {TrialCart} from '@/components/cj/trial-cart';

export const dynamic='force-dynamic';
export const metadata={title:'سلة تجربة CJ',robots:{index:false,follow:false}};
export default async function CjTrialCartPage(){
  const session=await requireAccess('products','view');
  return <TrialCart key={session.uid} accountId={session.uid}/>;
}
