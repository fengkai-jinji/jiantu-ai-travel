export type AgentEvent={requestId:string;seq:number;type:string;payload:Record<string,unknown>};

export async function readAgentStream<T extends {answer:string}>(response:Response,onEvent:(event:AgentEvent)=>void,signal?:AbortSignal):Promise<T>{
  if(signal?.aborted)throw new DOMException('请求已取消','AbortError');
  if(!response.body)throw new Error('服务未提供流式内容，请重试。');
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer='',requestId='',last=0,result:T|null=null;
  const cancel=()=>{void reader.cancel().catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
  try{
    while(true){
      if(signal?.aborted)throw new DOMException('请求已取消','AbortError');
      const {value,done}=await reader.read();
      if(signal?.aborted)throw new DOMException('请求已取消','AbortError');
      buffer+=done?decoder.decode():decoder.decode(value,{stream:true});
      buffer=buffer.replace(/\r\n/g,'\n');
      if(buffer.length>1000000)throw new Error('服务返回的片段过长。');
      let boundary:number;
      while((boundary=buffer.indexOf('\n\n'))>=0){
        const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);
        const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
        if(!data)continue;
        const event=JSON.parse(data) as AgentEvent;
        if(typeof event.requestId!=='string'||!Number.isInteger(event.seq)||!event.payload||typeof event.payload!=='object')throw new Error('服务事件格式无效。');
        if(!requestId){if(event.type!=='accepted')throw new Error('服务缺少接收确认。');requestId=event.requestId;}
        if(event.requestId!==requestId||event.seq<=last)continue;
        last=event.seq;
        if(event.type==='error')throw new Error(typeof event.payload.message==='string'?event.payload.message:'助手处理失败。');
        if(event.type==='result'){
          const candidate=event.payload.reply as T|undefined;
          if(!candidate||typeof candidate.answer!=='string')throw new Error('助手未返回有效回答。');
          result=candidate;
        }
        if(event.type==='done'){
          if(!result)throw new Error('助手未返回完整结果。');
          return result;
        }
        onEvent(event);
      }
      if(done)throw new Error('连接已中断，本次回答未完成，请重试。');
    }
  }finally{signal?.removeEventListener('abort',cancel);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
