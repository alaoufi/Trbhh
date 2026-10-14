const fs=require('node:fs');
function compose(config,container,image){
 if(!config.services?.app||!/^sha256:[a-f0-9]{64}$/.test(image)||!container.Config?.Env)throw Error('invalid_runtime');
 const result=structuredClone(config),app=result.services.app;
 app.image=image;delete app.build;
 app.environment=Object.fromEntries(container.Config.Env.map(value=>{const at=value.indexOf('=');if(at<1)throw Error('invalid_environment');return [value.slice(0,at),value.slice(at+1)];}));
 return result;
}
module.exports={compose};
if(require.main===module){const [config,before,image,out]=process.argv.slice(2);try{fs.writeFileSync(out,JSON.stringify(compose(JSON.parse(fs.readFileSync(config)),JSON.parse(fs.readFileSync(before))[0],image)),{mode:0o600,flag:'wx'});}catch{process.stderr.write('Runtime preparation failed; sensitive details withheld.\n');process.exitCode=1;}}
