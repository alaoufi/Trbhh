import 'server-only';
import {createHash} from 'node:crypto';
import {getVariants} from './client';
import {cjConfig} from './config';
import {createCjOptionMetadataReader} from './option-metadata';
import type {CjDetails} from './mapping';
const read=createCjOptionMetadataReader(getVariants);
export function enrichCjOptionMetadata(pid:string,rows:CjDetails['variants'],title:string){
 const c=cjConfig();
 const account=createHash('sha256').update(JSON.stringify([c.base,c.email,c.apiKey,c.encryptionKey])).digest('hex');
 return read(account,pid,rows,title);
}
