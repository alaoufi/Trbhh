import {randomUUID} from 'node:crypto';

export type PublicationOutcome='PUBLIC_NOW'|'PENDING_APPROVAL'|'SCHEDULED'|'STORE_ONLY'|'REJECTED';
type Stage='SUBMIT_STARTED'|'AUTH_OK'|'DESTINATION_RESOLVED'|'PACKAGE_OK'|'CATEGORY_VALIDATION_OK'|'BASE_VALIDATION_OK'|'DUPLICATE_CHECK_OK'|'DB_CREATED'|'PUBLICATION_STATE_ASSIGNED'|'CACHE_BUSTED'|'PUBLIC_VISIBILITY_CHECKED'|'REDIRECT_SUCCESS';
type Context={userId?:number;adId?:number;profileId?:number|null;destination?:'personal'|'store';categoryId?:number;subcategoryId?:number|null;status?:number;state?:string;store_only?:number;publish_at?:string|null;requireApproval?:boolean};
const allowed=new Set(['userId','adId','profileId','destination','categoryId','subcategoryId','status','state','store_only','publish_at','requireApproval']);
export function createPublishTrace(write:(line:string)=>void=line=>console.info(line)){
  const id=randomUUID();let terminal:PublicationOutcome|undefined;let createdAdId:number|undefined;
  const stage=(stage:Stage,context:Context={})=>{
    if(stage==='DB_CREATED')createdAdId=context.adId;
    write(JSON.stringify({publishTraceId:id,stage,...Object.fromEntries(Object.entries(context).filter(([key])=>allowed.has(key)))}));
  };
  stage('SUBMIT_STARTED');
  const outcome=(outcome:PublicationOutcome)=>{if(terminal)return;terminal=outcome;write(JSON.stringify({publishTraceId:id,outcome}));};
  return {id,stage,outcome,get createdAdId(){return createdAdId},finish:()=>{if(!terminal)outcome('REJECTED')}};
}

export function publicationOutcome(ad:{status:number;state:string;store_only:number;publish_at:Date|null},publiclyVisible:boolean,now=new Date()):PublicationOutcome {
  if(ad.state!=='active')return 'REJECTED';
  if(ad.publish_at&&ad.publish_at>now)return 'SCHEDULED';
  if(ad.status!==1)return 'PENDING_APPROVAL';
  if(ad.store_only===1)return 'STORE_ONLY';
  return publiclyVisible?'PUBLIC_NOW':'REJECTED';
}
