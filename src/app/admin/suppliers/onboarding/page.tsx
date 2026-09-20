import {requireAction} from '@/lib/roles';
import {SupplierOnboarding} from '@/components/supplier-onboarding';
import {previewOnboarding,confirmOnboarding,checkOnboarding} from './actions';
import {connectSalla} from '../integrations/actions';
export const dynamic='force-dynamic';
export const metadata={title:'رفع ملف متجر سلة',robots:{index:false,follow:false}};
export default async function OnboardingPage(){await requireAction('suppliers','view');return <SupplierOnboarding previewAction={previewOnboarding} saveAction={confirmOnboarding} readinessAction={checkOnboarding} connectAction={connectSalla}/>;}
