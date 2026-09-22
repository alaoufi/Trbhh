import {SALLA_OAUTH_SCOPE_VERSION} from './salla-scope-contract';

export type SupplierOAuthStatusKey='unauthorized'|'pending'|'authorized'|'expired'|'reauthorization_required';
export type SupplierOAuthStatus={key:SupplierOAuthStatusKey;label:string;tone:'slate'|'amber'|'emerald'|'red'};
type Input={inviteExpiresAt:Date|null;connection:{status:string;scopeVersion:number;hasTokens:boolean}|null};

const STATUS:Record<SupplierOAuthStatusKey,SupplierOAuthStatus>={
 unauthorized:{key:'unauthorized',label:'غير مفوض',tone:'slate'},
 pending:{key:'pending',label:'بانتظار التفويض',tone:'amber'},
 authorized:{key:'authorized',label:'مفوض',tone:'emerald'},
 expired:{key:'expired',label:'انتهت الصلاحية',tone:'red'},
 reauthorization_required:{key:'reauthorization_required',label:'يحتاج إعادة تفويض',tone:'red'},
};

export function resolveSupplierOAuthStatus(input:Input,now=new Date()):SupplierOAuthStatus{
 const connection=input.connection;
 if(connection?.status==='connected'&&connection.scopeVersion===SALLA_OAUTH_SCOPE_VERSION&&connection.hasTokens)return STATUS.authorized;
 if(input.inviteExpiresAt)return input.inviteExpiresAt.getTime()>now.getTime()?STATUS.pending:STATUS.expired;
 if(connection)return STATUS.reauthorization_required;
 return STATUS.unauthorized;
}
