import {ONBOARDING_FIELDS,type OnboardingValues} from './onboarding-fields';

const allowed=new Set(ONBOARDING_FIELDS.map(([key])=>String(key)));
export function supplierDataFormValues(form:FormData):OnboardingValues {
 const values:OnboardingValues={};
 for(const [key,value] of form.entries()){
  if(!allowed.has(key)||typeof value!=='string')continue;
  const normalized=value.normalize('NFKC').trim();
  if(normalized.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized))throw Error('supplier_data_form_invalid');
  values[key]=normalized||null;
 }
 return values;
}

export function supplierDataOrigin(env:NodeJS.ProcessEnv=process.env):string {
 const raw=env.SUPPLIER_PUBLIC_ORIGIN||'';
 const url=new URL(raw);
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('supplier_data_origin');
 return url.origin;
}
