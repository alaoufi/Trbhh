export function notificationId(value: unknown): bigint | null {
 const raw=String(value??'');
 if(!/^[1-9]\d{0,19}$/.test(raw))return null;
 const id=BigInt(raw);return id<=18446744073709551615n?id:null;
}
export function safeNotificationRoute(route:string|null):string {
 if(!route||!route.startsWith('/')||route.startsWith('//')||/[\\\u0000-\u0020\u007f]/.test(route))return '/notifications';
 try{const url=new URL(route,'https://trbhh.invalid');return url.origin==='https://trbhh.invalid'?route:'/notifications';}catch{return '/notifications';}
}
export function messageNotificationDestination(uid:number,sender:number,exists:boolean,canView:boolean):string|null {
 if(!canView)return null;
 return exists&&sender!==uid?`/messages/${sender}`:`/notifications/messages/${sender}`;
}
