import 'server-only';
import {createHash} from 'node:crypto';
import {getCjSizeChart} from './client';
import {cjConfig} from './config';
import type {CjSizeChart} from './size-chart';
const cache=new Map<string,{until:number;pending:Promise<CjSizeChart|null>}>();
export function readCjSizeChart(pid:string):Promise<CjSizeChart|null>{
 const c=cjConfig(),key=createHash('sha256').update(JSON.stringify([c.base,c.email,c.apiKey,c.encryptionKey,pid])).digest('hex');
 const prior=cache.get(key);if(prior&&prior.until>Date.now())return prior.pending;
 if(cache.size>=100)cache.delete(cache.keys().next().value!);
 const pending=getCjSizeChart(pid).then(r=>r.ok?r.data:null).catch(()=>null);
 cache.set(key,{until:Date.now()+5*60*1000,pending});return pending;
}
