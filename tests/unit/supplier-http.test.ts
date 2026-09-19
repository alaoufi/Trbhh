import {it,expect} from 'vitest';
import {boundedJson} from '@/lib/suppliers/http';
it('cancels oversized chunked bodies before buffering the entire response',async()=>{let cancelled=false;const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(1024));},cancel(){cancelled=true;}});await expect(boundedJson(new Response(stream),2048)).rejects.toThrow('supplier_http_size');expect(cancelled).toBe(true);});
