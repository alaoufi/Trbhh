import type {CategoryValidationError} from '@/lib/ad-categories/validation';

export type AdSubmissionState={error?:{fieldKey:string;message:string};publishTraceId?:string};

/** Only domain validation errors belong in user-visible feedback, never database errors. */
export function adValidationFailure(error:CategoryValidationError):AdSubmissionState {
  return {error:{fieldKey:error.fieldKey,message:error.message}};
}

export function publicationDestination(value:unknown):'personal'|'store' {
  return value==='store'?'store':'personal';
}
