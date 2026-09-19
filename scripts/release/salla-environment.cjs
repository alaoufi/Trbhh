const fs=require('node:fs');
const {randomBytes}=require('node:crypto');
const keys=['SALLA_CLIENT_ID','SALLA_CLIENT_SECRET','SALLA_WEBHOOK_SECRET','SUPPLIER_TOKEN_ENCRYPTION_KEY','SUPPLIER_RECONCILE_SECRET','SUPPLIER_PUBLIC_ORIGIN','SUPPLIER_ALLOW_LIVE_ORDERS'];
function parse(raw){
 const values=new Map();const other=[];
 for(const line of raw.replace(/\r\n/g,'\n').split('\n')){
  const match=line.match(/^([A-Z_]+)=(.*)$/);
  if(match&&keys.includes(match[1])){if(values.has(match[1]))throw Error('duplicate_key');values.set(match[1],match[2]);}
  else{if(!line.trimStart().startsWith('#')&&keys.some(key=>new RegExp('\\b'+key+'\\s*=').test(line)))throw Error('unsupported_assignment');other.push(line);}
 }
 return {values,other:other.join('\n').replace(/\n*$/,'')};
}
function prepareEnvironment(before,input){
 const parsed=parse(before),values=new Map();
 for(const key of keys.slice(0,3)){
  const value=input[key];if(typeof value!=='string'||!value.length||value.length>4096||!/^[A-Za-z0-9._~:/+=-]+$/.test(value))throw Error('invalid_secret');values.set(key,value);
 }
 for(const key of keys.slice(3,5)){
  const value=parsed.values.has(key)?parsed.values.get(key):randomBytes(32).toString('hex');
  if(!/^[a-fA-F0-9]{64}$/.test(value))throw Error('invalid_persistent_key');values.set(key,value);
 }
 values.set('SUPPLIER_PUBLIC_ORIGIN','https://trbhh.sa');values.set('SUPPLIER_ALLOW_LIVE_ORDERS','false');
 return (parsed.other?parsed.other+'\n':'')+[...values].map(([k,v])=>k+'='+v).join('\n')+'\n';
}
function verifyEnvironment(before,after){
 const a=parse(before),b=parse(after);if(a.other!==b.other)throw Error('unrelated_environment_changed');
 for(const key of keys.slice(0,3))if(!b.values.get(key)||!/^[A-Za-z0-9._~:/+=-]+$/.test(b.values.get(key)))throw Error('invalid_secret');
 for(const key of keys.slice(3,5)){if(!/^[a-fA-F0-9]{64}$/.test(b.values.get(key)||''))throw Error('invalid_persistent_key');if(a.values.has(key)&&a.values.get(key)!==b.values.get(key))throw Error('persistent_key_changed');}
 if(b.values.get('SUPPLIER_PUBLIC_ORIGIN')!=='https://trbhh.sa'||b.values.get('SUPPLIER_ALLOW_LIVE_ORDERS')!=='false')throw Error('unsafe_mode');
}
function verifyCompose(before,after){
 const strip=raw=>raw.replace(/\r\n/g,'\n').split('\n').filter(line=>!keys.some(key=>line===`      ${key}: \${${key}:-${key==='SUPPLIER_ALLOW_LIVE_ORDERS'?'false':''}}`)).join('\n');
 if(strip(before)!==strip(after))throw Error('unrelated_compose_changed');
}
function diagnoseEnvironment(before,input){
 const result={codes:[],secrets:{},persistent:{}};
 let parsed;
 try{parsed=parse(before);}catch(error){result.codes.push(['duplicate_key','unsupported_assignment'].includes(error.message)?error.message:'parse_failed');}
 for(const key of keys.slice(0,3)){
  const value=input?.[key];const present=typeof value==='string'&&value.length>0;
  const flags={present,sizeValid:present&&value.length<=4096,charactersValid:present&&/^[A-Za-z0-9._~:/+=-]+$/.test(value)};
  result.secrets[key]=flags;
  if(!Object.values(flags).every(Boolean)&&!result.codes.includes('invalid_secret'))result.codes.push('invalid_secret');
 }
 if(parsed)for(const key of keys.slice(3,5)){
  const present=parsed.values.has(key),value=parsed.values.get(key);
  result.persistent[key]={present,blank:present&&value==='',formatValid:present&&/^[a-fA-F0-9]{64}$/.test(value)};
  if(present&&!result.persistent[key].formatValid&&!result.codes.includes('invalid_persistent_key'))result.codes.push('invalid_persistent_key');
 }
 return result;
}
module.exports={prepareEnvironment,verifyEnvironment,verifyCompose,diagnoseEnvironment};
if(require.main===module||process.argv[1]==='salla-environment-diagnose'){
 try{
  const [mode,beforePath,afterPath]=process.argv.slice(2);
  if(!['prepare','verify','diagnose'].includes(mode))throw Error('mode');
  for(const path of [beforePath,...(mode==='verify'?[afterPath]:[])])if(!fs.lstatSync(path).isFile()||fs.lstatSync(path).isSymbolicLink())throw Error('unsafe_path');
  const before=fs.readFileSync(beforePath,'utf8');
  if(mode==='diagnose'){
   const result=diagnoseEnvironment(before,JSON.parse(fs.readFileSync(0,'utf8')));
   result.stageExists=fs.existsSync(afterPath);
   result.stageRegular=result.stageExists&&fs.lstatSync(afterPath).isFile()&&!fs.lstatSync(afterPath).isSymbolicLink();
   console.info(JSON.stringify(result));
  }else if(mode==='prepare'){
   const input=JSON.parse(fs.readFileSync(0,'utf8')),after=prepareEnvironment(before,input);verifyEnvironment(before,after);
   const fd=fs.openSync(afterPath,'wx',0o600);try{fs.writeFileSync(fd,after);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  }else {
   verifyEnvironment(before,fs.readFileSync(afterPath,'utf8'));
   const [oldCompose,newCompose]=process.argv.slice(5);
   if(!oldCompose||!newCompose)throw Error('compose_required');
   verifyCompose(fs.readFileSync(oldCompose,'utf8'),fs.readFileSync(newCompose,'utf8'));
  }
  if(mode!=='diagnose')console.info('Salla-only environment preservation verified; values withheld.');
 }catch{console.error('Salla environment preparation/verification failed; values withheld.');process.exitCode=1;}
}
