import {parseMapsUrl,type LatLng} from './maps';

const ALLOWED_GOOGLE_MAP_HOSTS=new Set([
  'maps.app.goo.gl','goo.gl','g.co','google.com','www.google.com','maps.google.com',
]);

function allowedGoogleMapsUrl(value:string):URL|null{
  try{
    const url=new URL(value);
    return url.protocol==='https:'&&ALLOWED_GOOGLE_MAP_HOSTS.has(url.hostname.toLowerCase())?url:null;
  }catch{return null;}
}

/** يحل روابط خرائط Google المختصرة دون السماح بتحويل الطلب إلى مضيف داخلي أو غريب. */
export async function resolveGoogleMapsCoordinates(input:string):Promise<LatLng|null>{
  const value=(input||'').trim();
  if(!value)return null;
  const direct=parseMapsUrl(value);
  if(direct)return direct;
  let current=allowedGoogleMapsUrl(value);
  if(!current)return null;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),6000);
  try{
    for(let hop=0;hop<5;hop+=1){
      const response=await fetch(current,{redirect:'manual',signal:controller.signal});
      const location=response.headers.get('location');
      if(response.status>=300&&response.status<400&&location){
        const next=allowedGoogleMapsUrl(new URL(location,current).toString());
        if(!next)return null;
        const coordinates=parseMapsUrl(next.toString());
        if(coordinates)return coordinates;
        current=next;
        continue;
      }
      if(response.status<200||response.status>=300)return null;
      return parseMapsUrl(response.url)||parseMapsUrl(await response.text().catch(()=>''));
    }
    return null;
  }catch{return null;}finally{clearTimeout(timeout);}
}
