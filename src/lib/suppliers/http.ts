import 'server-only';
/** Incremental cap, including chunked responses without Content-Length. */
export async function boundedJson(response:Response,maxBytes=65536):Promise<unknown> {
  if(!response.ok||!response.body)throw new Error('supplier_http_response');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new Error('supplier_http_size');}chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  finally {reader.releaseLock();}
}
