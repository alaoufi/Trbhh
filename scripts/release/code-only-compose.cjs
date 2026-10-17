const fs=require('node:fs');
function compose(config,container,image){
 if(!config.services?.app||!/^sha256:[a-f0-9]{64}$/.test(image)||!container.Config?.Env)throw Error('invalid_runtime');
 const result=structuredClone(config),app=result.services.app;
 app.image=image;delete app.build;
 app.environment=Object.fromEntries(container.Config.Env.map(value=>{const at=value.indexOf('=');if(at<1)throw Error('invalid_environment');return [value.slice(0,at),value.slice(at+1)];}));
 // Compose interpolates dollar signs even in JSON; preserve literal runtime values.
 const literal=value=>typeof value==='string'?value.replace(/\$/g,()=> '$$'):Array.isArray(value)?value.map(literal):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,literal(item)])):value;
 return literal(result);
}
function runtimeMatches(config,container){
 return container.Config.Env.every(value=>{
  const at=value.indexOf('='),expected=value.slice(at+1),actual=config.services.app.environment[value.slice(0,at)];
  // `compose config` serializes literal dollars escaped for a second load.
  return typeof actual==='string'&&(actual===expected||actual.replace(/\$\$/g,()=> '$')===expected);
 });
}
/** Input must be `docker compose config --format json`, with resolved volume names.
 * Never rewrite mounts to repair drift: refuse the switch before touching runtime. */
function mountsMatch(config,container){
 try{
  const expected=container.Mounts.map(m=>{
   if(!['volume','bind'].includes(m.Type)||typeof m.RW!=='boolean')throw Error('unsupported_mount');
   return {type:m.Type,source:m.Type==='volume'?m.Name:m.Source,target:m.Destination,readOnly:!m.RW};
  });
  const actual=(config.services.app.volumes||[]).map(m=>{
   if(!m||!['volume','bind'].includes(m.type)||typeof m.source!=='string'||typeof m.target!=='string'||m.volume?.subpath)throw Error('unsupported_mount');
   const source=m.type==='volume'?config.volumes?.[m.source]?.name:m.source;
   if(typeof source!=='string'||!source||!m.target.startsWith('/')||m.type==='bind'&&!source.startsWith('/'))throw Error('unresolved_mount');
   return {type:m.type,source,target:m.target,readOnly:m.read_only===true};
  });
  if(config.services.app.tmpfs?.length)throw Error('unsupported_mount');
  const canonical=mounts=>JSON.stringify(mounts.sort((a,b)=>a.target.localeCompare(b.target)));
  return canonical(actual)===canonical(expected);
 }catch{return false;}
}
module.exports={compose,runtimeMatches,mountsMatch};
if(require.main===module){const [config,before,image,out]=process.argv.slice(2);try{fs.writeFileSync(out,JSON.stringify(compose(JSON.parse(fs.readFileSync(config)),JSON.parse(fs.readFileSync(before))[0],image)),{mode:0o600,flag:'wx'});}catch{process.stderr.write('Runtime preparation failed; sensitive details withheld.\n');process.exitCode=1;}}
