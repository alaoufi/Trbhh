import {randomUUID} from 'node:crypto';

export type PublicationOutcome='PUBLIC_NOW'|'PENDING_APPROVAL'|'SCHEDULED'|'STORE_ONLY'|'REJECTED';
type Stage='SUBMIT_STARTED'|'AUTH_OK'|'DESTINATION_RESOLVED'|'PACKAGE_OK'|'CATEGORY_VALIDATION_OK'|'BASE_VALIDATION_OK'|'DUPLICATE_CHECK_OK'|'DB_CREATED'|'PUBLICATION_STATE_ASSIGNED'|'CACHE_BUSTED'|'PUBLIC_VISIBILITY_CHECKED'|'REDIRECT_SUCCESS';
type Context={userId?:number;adId?:number;profileId?:number|null;destination?:'personal'|'store';categoryId?:number;subcategoryId?:number|null;status?:number;state?:string;store_only?:number;publish_at?:string|null;requireApproval?:boolean};
const allowed=new Set(['userId','adId','profileId','destination','categoryId','subcategoryId','status','state','store_only','publish_at','requireApproval']);
type Operation='NONE'|'MEDIA_SAVE'|'QUOTA_LOG'|'PUBLICATION_EXTRAS'|'CACHE_INVALIDATION'|'PUBLIC_VISIBILITY'|'STORE_LINK'|'PROFILE_COOKIE';
export function safePublicationDiagnostic(error:unknown){
  const kind=error instanceof Error&&['Error','TypeError','RangeError','PrismaClientKnownRequestError','PrismaClientUnknownRequestError','PrismaClientValidationError'].includes(error.name)?error.name:'UnknownError';
  const code=error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&/^P\d{4}$/.test(error.code)?error.code:'unknown';
  const frames=error instanceof Error?(error.stack||'').split('\n').slice(1,11).flatMap(line=>{const match=line.match(/^\s+at (?:async )?([\w$.<>]+)\s+\(/);return match?[match[1]]:[]}).join(' > '):'';
  return {kind,code,frames};
}
export function createPublishTrace(write:(line:string)=>void=line=>console.info(line)){
  const id=randomUUID();let terminal:PublicationOutcome|undefined;let createdAdId:number|undefined;
  let currentStage:Stage='SUBMIT_STARTED',currentOperation:Operation='NONE',userId:number|undefined;
  const stage=(stage:Stage,context:Context={})=>{
    currentStage=stage;if(context.userId)userId=context.userId;
    if(stage==='DB_CREATED')createdAdId=context.adId;
    write(JSON.stringify({publishTraceId:id,stage,...Object.fromEntries(Object.entries(context).filter(([key])=>allowed.has(key)))}));
  };
  stage('SUBMIT_STARTED');
  const outcome=(outcome:PublicationOutcome)=>{if(terminal)return;terminal=outcome;write(JSON.stringify({publishTraceId:id,outcome}));};
  return {id,stage,outcome,operation:(operation:Operation)=>{currentOperation=operation},get userId(){return userId},get currentStage(){return currentStage},get currentOperation(){return currentOperation},get createdAdId(){return createdAdId},finish:()=>{if(!terminal)outcome('REJECTED')}};
}

export function publicationOutcome(ad:{status:number;state:string;store_only:number;publish_at:Date|null},publiclyVisible:boolean,now=new Date()):PublicationOutcome {
  if(ad.state!=='active')return 'REJECTED';
  if(ad.publish_at&&ad.publish_at>now)return 'SCHEDULED';
  if(ad.status!==1)return 'PENDING_APPROVAL';
  if(ad.store_only===1)return 'STORE_ONLY';
  return publiclyVisible?'PUBLIC_NOW':'REJECTED';
}
