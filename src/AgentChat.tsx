import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {Routes,TripContext,Place} from './tripTypes';
import {gsap,useGSAP,useReducedMotion} from './motion';
type Message={role:'user'|'assistant';content:string};
type Nearby={centerName:string;anchor:string;radius:number;keywords:string;source:string;queriedAt:string;places:(Place&{distance:number|null;type:string})[]};
type Reply={answer:string;trace:{tool:string;status:string;detail?:string}[];comparison:Routes|null;candidates:{query:string;places:{id:string;name:string;address:string}[]}[];nearby?:Nearby[];elapsedMs?:number;mode?:string};
export default function AgentChat({context,onResult,onBusy,onDestination,disabled=false}:{context:TripContext;onResult:(r:Routes)=>void;onBusy:(busy:boolean)=>void;onDestination:(place:Place,from:DOMRect)=>void;disabled?:boolean}){
  const [messages,setMessages]=useState<Message[]>([]),[input,setInput]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [ready,setReady]=useState<boolean|null>(null),[reply,setReply]=useState<Reply|null>(null);
  const [mapsReady,setMapsReady]=useState(false),[elapsed,setElapsed]=useState(0),[notice,setNotice]=useState('');
  const chat=useRef<HTMLElement>(null),reduced=useReducedMotion();
  useGSAP(()=>{if(!reduced&&messages.length)gsap.from('.chat-message:last-child',{y:12,opacity:.5,duration:.35,ease:'power2.out'});},{scope:chat,dependencies:[messages.length,reduced],revertOnUpdate:true});
  useGSAP(()=>{if(!reduced&&reply?.nearby?.length){gsap.from('.nearby-results',{y:14,opacity:.6,duration:.4});gsap.from('.nearby-results li',{y:18,opacity:.35,duration:.45,stagger:.06,ease:'power2.out'});}},{scope:chat,dependencies:[reply,reduced],revertOnUpdate:true});
  const controller=useRef<AbortController|null>(null),busyCallback=useRef(onBusy);busyCallback.current=onBusy;
  const signature=JSON.stringify(context);
  useEffect(()=>{const pending=controller.current;pending?.abort();controller.current=null;setBusy(false);busyCallback.current(false);setReply(null);setError('');if(pending)setNotice('出行信息已更新，已取消等待上一条回复；历史对话保留。');},[signature]);
  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>{if(!busy)return;setElapsed(0);const timer=setInterval(()=>setElapsed(value=>value+1),1000);return()=>clearInterval(timer);},[busy]);
  async function check(){try{const r=await fetch('/trip-api/status');if(!r.ok)throw new Error();const data=await r.json();setReady(!!data.agentConfigured);setMapsReady(!!data.configured);setError('');}catch{setReady(null);setMapsReady(false);setError('无法连接地图与 Agent 服务，请启动项目。');}}
  useEffect(()=>{void check();},[]);
  async function submit(e:FormEvent){
    e.preventDefault();if(busy||disabled||!input.trim())return;
    const next:Message[]=[...messages.slice(-8),{role:'user',content:input.trim()}];
    setMessages(next);setInput('');setError('');setNotice('');setReply(null);setBusy(true);onBusy(true);
    controller.current?.abort();const current=new AbortController();controller.current=current;
    const timeout=setTimeout(()=>current.abort('timeout'),70000);
    try{
      const r=await fetch('/trip-api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:next,context}),signal:current.signal});
      const data=await r.json().catch(()=>({error:'服务未返回有效内容，请重试。'}));
      if(!r.ok||data.error)throw new Error(data.error||'Agent 请求失败');
      if(current.signal.aborted)return;
      setReply(data);setMessages([...next,{role:'assistant',content:data.answer}]);if(data.comparison)onResult(data.comparison);
    }catch(e){if(controller.current===current){if(current.signal.reason==='user')setNotice('已取消等待，原有路线已保留。后台请求可能仍在结束处理。');else setError(current.signal.aborted?'处理超时，原有路线已保留，可以重试。':(e as Error).message);setMessages(next.slice(0,-1));setInput(next[next.length-1].content);}}
    finally{clearTimeout(timeout);if(controller.current===current){controller.current=null;setBusy(false);onBusy(false);}}
  }
  return <section className="agent-chat motion-chat" aria-label="出行 Agent" ref={chat}><div className="card-top"><h2>和出行助手聊一聊</h2><span className="badge">{ready?'AI 对话与地图查询':mapsReady?'地图直查可用 · AI 待配置':'检查连接中'}</span></div>
    <p className="fine">可以问“附近有什么小吃”，默认以左侧确认的出发地为中心查找；也可以问目的地附近。聊天不会清除已有路线。修改地点后保留历史对话，后续查询以当前确认位置为准。</p>
    {ready===false&&<p className="caution">AI 对话尚未配置，附近餐饮仍可直接查询；请先确认出发地。</p>}
    <button type="button" className="text-button" onClick={()=>void check()} disabled={busy||disabled}>检查连接</button>
    <div className="chat-messages" role="log" aria-label="出行对话">{messages.map((m,i)=><article key={i} className={`chat-message ${m.role}`}><strong>{m.role==='user'?'你':'AI 助手'}</strong><p>{m.content}</p></article>)}</div>
    {busy&&<div className="agent-waiting"><span className="halo" aria-hidden="true"><svg viewBox="0 0 30 30"><circle className="halo-a" cx="15" cy="15" r="11"/><circle className="halo-b" cx="15" cy="15" r="7"/></svg></span><p role="status" className="status">正在处理，已等待 {elapsed} 秒…</p><button type="button" className="text-button agent-cancel" onClick={()=>controller.current?.abort('user')}>取消等待</button></div>}{notice&&<p role="status" className="status">{notice}</p>}{error&&<p role="alert" className="error">{error}</p>}
    {reply&&<>{typeof reply.elapsedMs==='number'&&<p className="fine">{reply.mode==='map'?'高德直查':'AI 与工具处理'} · 本次服务处理 {(reply.elapsedMs/1000).toFixed(1)} 秒</p>}<details><summary>本次工具执行记录（{reply.trace.length} 次）</summary><ul>{reply.trace.map((t,i)=><li key={i}>{t.tool==='search_places'?'查找地点':t.tool==='search_nearby'?'搜索附近餐饮':t.tool==='compare_routes'?'比较路线':'未授权工具'}：{t.status}{t.detail&&` · ${t.detail}`}</li>)}</ul></details>{reply.candidates.map((c,i)=><div className="sample-result" key={i}><h3>“{c.query}”的高德候选</h3><ul>{c.places.map(p=><li key={p.id}>{p.name} · {p.address}</li>)}</ul><p>请在左侧对应输入框选择具体地点后，再让助手比较路线。</p></div>)}{reply.nearby?.map((result,index)=><section className="nearby-results" key={index} aria-label="附近餐饮推荐"><h3>{result.centerName}附近的{result.keywords||'餐饮'}</h3><p className="fine">约 {result.radius/1000} 公里范围，按高德返回的距离排序。</p>{result.places.length===0&&<p>没有找到符合条件的店铺，可以换个关键词或位置。</p>}<ul>{result.places.map(place=><li key={place.id}><div><h4>{place.name}</h4><p>{place.address||'地址未提供'}</p><p className="nearby-distance">{place.distance===null?'距离未提供':`直线距离约 ${place.distance} 米`}</p></div><button type="button" className="button secondary nearby-pick" disabled={busy||disabled} onClick={event=>onDestination(place,event.currentTarget.closest('li')!.getBoundingClientRect())}>设为目的地</button></li>)}</ul><p className="fine">来源：{result.source} · {new Date(result.queriedAt).toLocaleString('zh-CN')}<br/>直线距离不等于步行距离；营业状态、口味、价格与无障碍条件需另行核实。</p></section>)}</>}
    <form onSubmit={submit}><label htmlFor="agent-question">描述需求或继续补充</label><textarea className="field" id="agent-question" disabled={busy} required maxLength={1000} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();e.currentTarget.form?.requestSubmit();}}} placeholder="例如：推荐出发地附近的小吃；或比较去目的地的路线。"/><div className="scene-toolbar"><button type="submit" className="button" disabled={busy||disabled||(!ready&&!mapsReady)}>发送给出行助手</button><button type="button" className="button secondary" disabled={busy} onClick={()=>{setMessages([]);setReply(null);setError('');setNotice('');}}>清空对话</button></div></form>
    <p className="fine">附近餐饮直查仅将中心点和搜索词交给高德；其他 AI 对话及已确认的出行信息会交给配置的大模型服务商。对话不写入本地文件。AI 解释可能有误，以高德结果卡片为依据；无障碍设施仍待核实。</p>
  </section>;
}
