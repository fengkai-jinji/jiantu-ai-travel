import test from 'node:test';
import assert from 'node:assert/strict';
import {readAgentStream} from '../src/agentStream.ts';

const event=(type:string,seq:number,payload:object={},requestId='r1')=>`event: ${type}\ndata: ${JSON.stringify({type,seq,payload,requestId})}\n\n`;
function response(text:string){const bytes=new TextEncoder().encode(text);return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=3)controller.enqueue(bytes.slice(i,i+3));controller.close();}}));}
test('UTF8 fragments, duplicate and foreign events do not corrupt public text',async()=>{
  const events:string[]=[];
  const result=await readAgentStream(response(event('accepted',1)+event('answer_delta',2,{text:'中文'})+event('answer_delta',2,{text:'重复'})+event('answer_delta',3,{text:'别的请求'},'r2')+event('result',3,{reply:{answer:'完整中文'}})+event('done',4)),e=>{if(e.type==='answer_delta')events.push(String(e.payload.text));});
  assert.deepEqual(events,['中文']);assert.equal(result.answer,'完整中文');
});
test('a final result without done is incomplete',async()=>{
  await assert.rejects(()=>readAgentStream(response(event('accepted',1)+event('result',2,{reply:{answer:'partial'}})),()=>{}),/未完成/);
});
test('server errors remain errors instead of completed replies',async()=>{
  await assert.rejects(()=>readAgentStream(response(event('accepted',1)+event('error',2,{message:'配额不足'})),()=>{}),/配额不足/);
});
test('abort signal rejects a response even before reading',async()=>{
  const c=new AbortController();c.abort();await assert.rejects(()=>readAgentStream(response(''),()=>{},c.signal),{name:'AbortError'});
});
