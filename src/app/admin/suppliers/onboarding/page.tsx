import { requireAdminPage, readActorAccess } from '@/lib/access-control/guards';

import {SupplierOnboarding} from '@/components/supplier-onboarding';
import {previewOnboarding,confirmOnboarding,checkOnboarding} from './actions';
import {connectSalla} from '../integrations/actions';
export const dynamic='force-dynamic';
export const metadata={title:'رفع ملف متجر سلة',robots:{index:false,follow:false}};
export default async function OnboardingPage(){const session=await requireAdminPage('/admin/suppliers/onboarding');const {keys}=await readActorAccess(session.uid);return <SupplierOnboarding canSave={keys.has('suppliers:create')||keys.has('suppliers:edit')} canAuthorize={keys.has('integrations:authorize')} previewAction={previewOnboarding} saveAction={confirmOnboarding} readinessAction={keys.has('integrations:sync')?checkOnboarding:undefined} connectAction={keys.has('integrations:authorize')?connectSalla:undefined}/>;}
