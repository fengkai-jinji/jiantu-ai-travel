import {useEffect,useRef,useState} from 'react';
import {gsap,useGSAP,useReducedMotion} from './motion';
import './knowledge.css';
export {default as Trip} from './Trip';
const TOPICS=['怎样提供帮助','认识视障与无障碍','设施与公共交通','陪同出行','景点与出游'];
const SUGGESTIONS:Record<string,string[]>={
'怎样提供帮助':['遇到视障人士，怎样询问是否需要帮助？','应该怎样清楚地描述方向？'],
'认识视障与无障碍':['视障人群都完全看不见吗？','什么是数字无障碍？'],
'设施与公共交通':['出发前怎样确认电梯是否可用？','导盲犬可以进入公共场所吗？'],
'陪同出行':['陪同去陌生医院，需要提前确认什么？','怎样一起做好出行准备？'],
'景点与出游':['南京有哪些适合半天游玩的景点？','去中山陵需要提前预约吗？']};
const GUIDES:Record<string,{intro:string;check:string[]}>= {
'怎样提供帮助':{intro:'把对方的意愿放在前面，从开口询问、描述方向到一起行动，了解帮助的分寸。',check:['描述你所在的位置与希望提供的帮助','让对方决定是否接受、怎样接受帮助','遇到不确定的情境，先停下来沟通']},
'认识视障与无障碍':{intro:'理解不同的视力状况，也理解读屏、文字描述与清晰信息为何重要。',check:['区分个人体验与一般知识','问清对方习惯的信息获取方式','查阅资料时留意适用范围与发布时间']},
'设施与公共交通':{intro:'设施信息会变化。把知识查询变成一份能向车站或场所工作人员确认的问题清单。',check:['确认准确站点、入口和出发日期','询问电梯位置、运行与替代通道','将实时状态与资料介绍分别核实']},
'陪同出行':{intro:'从行前沟通到抵达后的衔接，围绕本人需求准备信息，减少陌生环境中的不确定。',check:['与同行者共同确认目的地及具体入口','整理预约信息和现场联系人','提前商量遇到变更时的替代安排']},
'景点与出游':{intro:'先了解景点，再核实当日安排。预约、开放时间与无障碍通道都需要最新官方信息。',check:['确认游览日期、景区和具体区域','向景区核对预约、开放与接驳安排','结合体力和陪同需求安排休息与返程']}};
type KbSource={id:string;title:string;publisher:string;url:string;date:string;region:string;summary:string;verified:boolean};
type KbReply={answer:string;sources:KbSource[];mode:'ai'|'library'|'none';refusal:boolean;evidence?:{total:number;verified:number;unverified:number;warning:string}};
type Turn={question:string;reply:KbReply};
function speak(text:string,onError:(msg:string)=>void){
if(!window.speechSynthesis){onError('浏览器不支持朗读，请阅读文字内容。');return;}
window.speechSynthesis.cancel();const s=new SpeechSynthesisUtterance(text);s.lang='zh-CN';s.rate=.95;
s.onerror=e=>{if(!['canceled','interrupted'].includes(e.error))onError('语音暂不可用，请阅读文字内容。');};window.speechSynthesis.speak(s);
}
function sourceUrl(value:string){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}}
export function Knowledge(){
const workspace=useRef<HTMLDivElement>(null),reduced=useReducedMotion();
const request=useRef<{controller:AbortController;timer:ReturnType<typeof setTimeout>}|null>(null);
const [topic,setTopic]=useState(TOPICS[0]);
const [input,setInput]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
const [pending,setPending]=useState(''),[sessions,setSessions]=useState<Record<string,Turn[]>>({});
const turns=sessions[topic]||[],current=turns.at(-1),reply=current?.reply;
const guide=GUIDES[topic],unverified=reply?.sources.filter(s=>s.verified!==true).length||0;
useEffect(()=>()=>{const active=request.current;request.current=null;if(active){clearTimeout(active.timer);active.controller.abort();}window.speechSynthesis?.cancel();},[]);
useGSAP(()=>{if(!reduced)gsap.from('.question-options button',{x:12,opacity:.5,duration:.4,stagger:.06,ease:'power2.out'});},{scope:workspace,dependencies:[topic,reduced],revertOnUpdate:true});
useGSAP(()=>{if(!reduced&&reply)gsap.from('.kb-result',{y:12,opacity:.6,duration:.45,ease:'power2.out'});},{scope:workspace,dependencies:[reply,reduced],revertOnUpdate:true});
function cancel(message='已取消本次查询，已有结果保留。'){
const active=request.current;request.current=null;if(active){clearTimeout(active.timer);active.controller.abort();}setBusy(false);setPending('');setNotice(message);
}
function switchTopic(next:string){if(next===topic)return;cancel('已切换主题。每个主题独立保留本页会话，追问只携带当前主题最近三轮。');window.speechSynthesis?.cancel();setTopic(next);setInput('');setError('');}
async function ask(q:string){
const question=q.trim();if(request.current||!question)return;
window.speechSynthesis?.cancel();setBusy(true);setError('');setNotice('');setPending(question);
const controller=new AbortController();let timedOut=false;
const active={controller,timer:setTimeout(()=>{timedOut=true;controller.abort();},35000)};request.current=active;
const messages=turns.slice(-3).flatMap(t=>[{role:'user',content:t.question},{role:'assistant',content:(t.reply.answer||'仅检索到参考摘要，尚未生成回答。').slice(0,2000)}]);
try{
const response=await fetch('/trip-api/kb',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({topic,messages:[...messages,{role:'user',content:question}]})});
const data=await response.json().catch(()=>{throw new Error('服务未返回有效内容，请重试。');});
if(request.current!==active)return;
if(controller.signal.aborted)throw new DOMException('查询已取消','AbortError');
if(!data||typeof data!=='object')throw new Error('服务返回格式不完整，请稍后重试。');
if(!response.ok||data.error)throw new Error(data.error||'知识库服务请求失败，请稍后重试。');
if(typeof data.answer!=='string'||!Array.isArray(data.sources)||!['ai','library','none'].includes(data.mode)||typeof data.refusal!=='boolean'||!data.sources.every((s:KbSource)=>s&&['id','title','publisher','url','date','region','summary'].every(k=>typeof (s as unknown as Record<string,unknown>)[k]==='string')&&typeof s.verified==='boolean'))throw new Error('服务返回格式不完整，请稍后重试。');
setSessions(previous=>({...previous,[topic]:[...(previous[topic]||[]),{question,reply:data}]}));setInput('');
}catch(e){if(request.current===active)setError(timedOut?'查询已超时（35 秒）。已有结果保留，请稍后重试。':e instanceof Error?e.message:'知识库服务暂不可用，请稍后重试。');}
finally{clearTimeout(active.timer);if(request.current===active){request.current=null;setBusy(false);setPending('');}}
}
function focusSource(index:number){const card=workspace.current?.querySelector<HTMLElement>(`#kb-source-${index}`);card?.scrollIntoView({behavior:reduced?'auto':'smooth',block:'center'});card?.focus({preventScroll:true});}
function answerText(value:string){return value.split(/(来源\s*\d+)/g).map((part,index)=>{const n=/^来源\s*(\d+)$/.exec(part);return n&&reply?.sources[Number(n[1])-1]?<button key={index} className="kb-citation" aria-controls={`kb-source-${Number(n[1])-1}`} onClick={()=>focusSource(Number(n[1])-1)}>{part}</button>:part;});}
return <div ref={workspace} className="knowledge-motion kb-workspace">
<div className="page-heading kb-heading"><div><p className="eyebrow">UNDERSTAND FIRST / HELP WITH CARE</p><h1>让理解，成为帮助的开始。</h1><p>面向大众、家属与志愿者的无障碍知识问答。带着具体情境提问，带着来源判断信息。</p></div><span className="badge">资料可追溯 · 核验状态透明</span></div>
<div className="knowledge-layout"><aside className="panel kb-sidebar"><p className="eyebrow">01 / 选择主题</p><h2>从关心的事开始</h2><div className="topics" aria-label="知识主题">{TOPICS.map((t,i)=><button key={t} className={topic===t?'active':''} aria-pressed={topic===t} onClick={()=>switchTopic(t)}><small>0{i+1}</small><span>{t}</span>{!!sessions[t]?.length&&<span className="kb-topic-count">{sessions[t].length}</span>}</button>)}</div><details className="kb-session-rule"><summary>每个主题，独立保留会话</summary><p>切换主题会取消正在进行的请求。本页保留各主题历史，追问携带最近三轮；离开此页或刷新后清空。</p></details></aside>
<section className="panel kb-main"><div className="kb-section-top"><p className="eyebrow">02 / 把情境说清楚</p><span className="kb-round">{turns.length?`本主题已完成 ${turns.length} 轮`:'开始一段对话'}</span></div><h2>{topic}</h2><p className="kb-intro">{guide.intro}</p>
<div className="question-options">{SUGGESTIONS[topic].map(q=><button key={q} disabled={busy} onClick={()=>void ask(q)}>{q}<span aria-hidden="true"> ↗</span></button>)}</div>
<form className="question-form" onSubmit={e=>{e.preventDefault();void ask(input);}}><label htmlFor="question" className="visually-hidden">输入无障碍相关问题</label><input className="field" id="question" required maxLength={500} placeholder={turns.length?'继续追问，也可提出当前主题的新问题…':'例如：陪同去陌生医院，行前要确认什么？'} value={input} onChange={e=>setInput(e.target.value)}/><button className="button" disabled={busy||!input.trim()}>{busy?'查询中…':'发送问题 ↗'}</button></form>
<p className="kb-input-note">最多 500 字 · 建议补充地点、时间与具体困惑。回答将附上匹配资料，请留意核验状态与适用范围。</p>
{busy&&<div className="kb-pending"><div role="status"><span className="kb-pulse" aria-hidden="true"/><strong>正在查询资料并等待完整结果</strong><p>{pending}</p><small>查询期间可继续查看已有结果。35 秒未响应将结束等待。</small></div><button type="button" className="text-button" onClick={()=>cancel()}>取消查询</button></div>}
{notice&&<p className="kb-notice" role="status">{notice}</p>}{error&&<p role="alert" className="error">{error}</p>}
{turns.length>1&&<details className="kb-history"><summary>查看本主题之前的 {turns.length-1} 轮问答</summary>{turns.slice(0,-1).map((t,i)=><article key={i}><span>第 {i+1} 轮</span><h3>{t.question}</h3><p>{t.reply.answer||'仅检索到参考资料，未生成综合回答。'}</p><small>资料：{t.reply.sources.map(s=>s.title).join('；')||'暂无匹配资料'}。{t.reply.sources.some(s=>!s.verified)?'该轮包含待核验来源，不能据此确认实时情况。':'核验标记不代表实时查询。'}</small></article>)}</details>}
{current&&reply&&<article className="kb-result" aria-label="最近一次查询结果"><div className="kb-result-head"><span className="eyebrow">03 / {reply.refusal?'资料不足':reply.mode==='ai'?'基于资料生成的回答':'资料检索结果'}</span><span>{reply.sources.length} 条来源 · {reply.sources.filter(s=>s.verified===true).length} 条标记已核验</span></div><h3>{current.question}</h3>
{unverified>0&&<div className="kb-evidence-warning" role="note"><strong>注意：本次包含 {unverified} 条待核验来源</strong><p>未完成原文与时效核验，摘要仅供参考。预约、开放安排、费用与设施运行状态须向发布机构确认，不能据此确定当前情况。</p></div>}
{reply.refusal?<p className="caution">{reply.answer}</p>:reply.answer?<p className="kb-answer">{answerText(reply.answer)}</p>:<p className="kb-library-note">本次仅返回知识库资料摘要，未生成综合回答。请逐条查看下方来源与核验状态；摘要内容不代表已确认的当前事实。</p>}
{reply.sources.length>0&&<><div className="kb-source-nav" aria-label="跳转到来源">{reply.sources.map((s,i)=><button key={s.id} onClick={()=>focusSource(i)} aria-controls={`kb-source-${i}`}>来源{i+1} <span>↓</span></button>)}</div><div className="kb-source-heading"><h4>沿着来源，核对答案</h4><span>资料负责人标记 ≠ 实时查询</span></div><div className="kb-sources">{reply.sources.map((s,i)=><section key={s.id} id={`kb-source-${i}`} tabIndex={-1} className="kb-source-card"><div className="kb-source-card-top"><span>来源{i+1}</span><span className={s.verified===true?'kb-verified':'kb-unverified'}>{s.verified===true?'资料标记已核验':'待核验'}</span></div><h4>{s.title}</h4><dl><div><dt>发布机构</dt><dd>{s.publisher||'未提供'}</dd></div><div><dt>资料日期</dt><dd>{s.date||'未提供'}（非实时查询日期）</dd></div><div><dt>适用地区</dt><dd>{s.region||'未提供'}</dd></div></dl><p className="kb-summary">{s.summary}</p>{sourceUrl(s.url)?<a className="kb-original" href={sourceUrl(s.url)!} target="_blank" rel="noopener noreferrer">查看原始页面 ↗<small>{s.url}</small></a>:<p className="kb-missing-link">{s.url?'来源网址无效，需资料负责人核对。':'尚未补充原文链接，无法直接核对。'}</p>}</section>)}</div></>}
{reply.answer&&!reply.refusal&&<div className="scene-toolbar"><button className="button secondary" onClick={()=>speak(`关于${current.question}。${unverified?'本回答包含待核验来源，当前情况请向发布机构确认。':''}${reply.answer}`,setError)}>朗读回答</button><button className="text-button" onClick={()=>window.speechSynthesis?.cancel()}>停止朗读</button></div>}
</article>}
{!current&&!busy&&<div className="kb-start"><span className="eyebrow">让每一次帮助更有准备</span><h3>一个具体问题，一次有依据的理解。</h3><p>可以先选上方的常见问题。资料匹配后会展示原文链接、发布日期与核验状态；资料不足时会明确说明。</p><div className="kb-answer-steps"><span>提出情境</span><span>查看依据</span><span>核实后行动</span></div></div>}
<div className="kb-check"><div><p className="eyebrow">BEFORE YOU GO</p><h3>把疑问带到现场核实</h3><p>以下是提问方向，不是对具体场所的情况确认。</p></div><ol>{guide.check.map(item=><li key={item}>{item}</li>)}</ol></div>
</section></div></div>;
}
