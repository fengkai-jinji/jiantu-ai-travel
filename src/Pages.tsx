import {useRef,useState} from 'react';
import {gsap,useGSAP,useReducedMotion} from './motion';

export {default as Trip} from './Trip';

export function PendingVision(){return <><div className="page-heading"><div><p className="eyebrow">UNDERSTAND WHAT IS AROUND YOU</p><h1>了解眼前，多一份信息。</h1><p>开启画面，查看环境中的目标与提示。</p></div><span className="badge">室外模型待接入</span></div><div className="split"><section className="panel"><div className="scene"><img src="./assets/outdoor.svg" alt="包含行人与积水的道路插画"/><span className="badge">环境感知 · 场景插画</span></div><div className="scene-toolbar"><a className="button" href="#indoor">先体验室内寻物 →</a></div><p className="fine">室外模型接入后，将支持实际画面检测。</p></section><aside className="panel"><h2>环境提示</h2><div className="sample-result"><h3>等待实际检测</h3><p>当前展示的是场景插画，没有检测结果。</p></div><h2>语音提示</h2><p className="lead">识别后提供目标方位与简短播报。</p><div className="caution">不凭检测框推断精确距离或保证安全通行。</div></aside></div></>;}

const TOPICS=['怎样提供帮助','认识视障与无障碍','设施与公共交通','陪同出行','景点与出游'];
const SUGGESTIONS:Record<string,string[]>={
  '怎样提供帮助':['遇到视障人士，怎样询问是否需要帮助？','应该怎样清楚地描述方向？'],
  '认识视障与无障碍':['视障人群都完全看不见吗？','什么是数字无障碍？'],
  '设施与公共交通':['出发前怎样确认电梯是否可用？','导盲犬可以进入公共场所吗？'],
  '陪同出行':['陪同去陌生医院，需要提前确认什么？','怎样一起做好出行准备？'],
  '景点与出游':['南京有哪些适合半天游玩的景点？','去中山陵需要提前预约吗？']
};
type KbSource={id:string;title:string;publisher:string;url:string;date:string;region:string;summary:string;verified:boolean};
type KbReply={answer:string;sources:KbSource[];mode:'ai'|'library'|'none';refusal:boolean};
type ChatMsg={role:'user'|'assistant';content:string};
function speak(text:string,onError:(msg:string)=>void){
  if(!window.speechSynthesis){onError('浏览器不支持朗读，请阅读文字内容。');return;}
  window.speechSynthesis.cancel();
  const s=new SpeechSynthesisUtterance(text);
  s.lang='zh-CN';s.rate=.95;
  s.onerror=e=>{if(!['canceled','interrupted'].includes(e.error))onError('语音暂不可用，请阅读文字内容。');};
  window.speechSynthesis.speak(s);
}
export function Knowledge(){
  const workspace=useRef<HTMLDivElement>(null),reduced=useReducedMotion();
  const [topic,setTopic]=useState(TOPICS[0]);
  const [input,setInput]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [asked,setAsked]=useState(''),[reply,setReply]=useState<KbReply|null>(null),[history,setHistory]=useState<ChatMsg[]>([]);
  useGSAP(()=>{if(!reduced)gsap.from('.question-options button',{x:12,opacity:.5,duration:.4,stagger:.06,ease:'power2.out'});},{scope:workspace,dependencies:[topic,reduced],revertOnUpdate:true});
  useGSAP(()=>{if(!reduced&&reply)gsap.from('.answer-example',{y:16,duration:.5,ease:'power2.out'});},{scope:workspace,dependencies:[reply,reduced],revertOnUpdate:true});
  async function ask(q:string){
    if(busy||!q.trim())return;
    setBusy(true);setError('');setReply(null);setAsked(q.trim());
    try{
      const r=await fetch('/trip-api/kb',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic,messages:[...history.slice(-6),{role:'user',content:q.trim()}]})});
      const data=await r.json().catch(()=>({error:'服务未返回有效内容，请重试。'}));
      if(!r.ok||data.error)throw new Error(data.error||'知识库请求失败');
      setReply(data);setHistory([...history.slice(-6),{role:'user',content:q.trim()},{role:'assistant',content:data.answer}]);
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }
  return <div ref={workspace} className="knowledge-motion"><div className="page-heading"><div><p className="eyebrow">KNOW MORE. HELP BETTER.</p><h1>让理解，成为帮助的开始。</h1><p>面向大众、家属、志愿者，也向所有有疑问的人开放。</p></div><span className="badge">知识库检索 · 来源可查</span></div><div className="knowledge-layout"><aside className="panel"><h2>从一个主题开始</h2><div className="topics">{TOPICS.map(t=><button key={t} className={topic===t?'active':''} aria-pressed={topic===t} onClick={()=>setTopic(t)}>{t}</button>)}</div><p className="fine">回答基于知识库检索并标注来源；资料不足时明确说明无法确认，不做猜测。追问请围绕同一个问题。</p></aside><section className="panel">
    <div className="benefits"><span>有来源的解释</span><span>资料不足时明确拒答</span><span>支持朗读</span></div>
    <h2>你想了解什么？</h2>
    <div className="question-options">{SUGGESTIONS[topic].map(q=><button key={q} onClick={()=>void ask(q)}>{q}</button>)}</div>
    <form className="question-form" onSubmit={e=>{e.preventDefault();void ask(input);}}>
      <label htmlFor="question" className="visually-hidden">输入无障碍相关问题</label>
      <input className="field" id="question" required maxLength={500} placeholder="输入你想了解的问题…" value={input} onChange={e=>setInput(e.target.value)}/>
      <button className="button" disabled={busy}>{busy?'检索中…':'提问 →'}</button>
    </form>
    {error&&<p role="alert" className="error">{error}</p>}
    {reply&&<div className="answer-example" role="status">
      <span className="eyebrow">{reply.mode==='ai'?'AI 回答 · 基于知识库检索':reply.mode==='library'?'知识库检索结果（大模型未配置）':'未能回答'}</span>
      <h3>{asked}</h3>
      {reply.refusal&&<div className="caution">{reply.answer}</div>}
      {!reply.refusal&&reply.answer&&<p className="kb-answer">{reply.answer}</p>}
      {!reply.refusal&&!reply.answer&&reply.sources.map(s=><div className="source-item" key={s.id}><strong>{s.title}</strong><p>{s.summary}</p></div>)}
      <div className="answer-source">来源（共 {reply.sources.length} 条，以原文为准）：
        <ol className="source-list">{reply.sources.map(s=><li key={s.id}><strong>{s.title}</strong> · {s.publisher}{s.date?` · ${s.date}`:''}{s.region?` · 适用：${s.region}`:''}{!s.verified&&' · 链接待资料负责人核对'}{s.url&&<><br/><a href={s.url} target="_blank" rel="noreferrer">{s.url}</a></>}</li>)}</ol>
      </div>
      {reply.answer&&!reply.refusal&&<div className="scene-toolbar"><button className="button secondary" onClick={()=>speak(`关于${asked}，${reply.answer}`,setError)}>朗读回答</button><button className="text-button" onClick={()=>window.speechSynthesis?.cancel()}>停止朗读</button></div>}
    </div>}
    {!reply&&!error&&<div className="answer-example" role="status"><span className="eyebrow">ANSWER STRUCTURE</span><h3>点击一个问题，看看答案将怎样呈现。</h3><p>正式版本在检索知识库后给出简短结论，再说明具体做法与适用情境，并列出全部来源。</p></div>}
  </section></div></div>;
}
