import {useId,useRef,useState} from 'react';
import {Flip} from 'gsap/Flip';
import {gsap,useGSAP,useReducedMotion} from './motion';
import type {Routes,Route} from './tripTypes';
import WorkbenchIcon from './WorkbenchIcon';
gsap.registerPlugin(Flip);

function RideOverview({legs}:{legs:NonNullable<Route['legs']>}){
  return <div className="ride-overview"><h4>乘车概览</h4><ol className="ride-list">
    {legs.map((leg,index)=><li key={index} className="ride-item" data-kind={leg.kind}>
      <span className="ride-dot" aria-hidden="true"/><div><strong>{leg.name}</strong>
      <small>{leg.from} 上车 → {leg.to} 下车{index<legs.length-1&&' · 到站后换乘'}</small></div></li>)}
  </ol></div>;
}
function RouteTimeline({steps}:{steps:string[]}){
  const [open,setOpen]=useState(false);const extraId=useId();
  function item(text:string,index:number){return <li key={index}><span className="timeline-node"><WorkbenchIcon name={/乘坐|公交|地铁|号线/.test(text)?'bus':/到达/.test(text)?'pin':'walk'}/></span><p>{text}</p></li>;}
  return <><ol className="route-timeline" aria-label="路线分段指引">{steps.slice(0,3).map(item)}</ol>{steps.length>3&&<><div className="timeline-extra" id={extraId} data-open={open} aria-hidden={!open}><div><ol className="route-timeline" start={4}>{steps.slice(3).map((text,index)=>item(text,index+3))}</ol></div></div><button className="timeline-toggle text-button" type="button" aria-expanded={open} aria-controls={extraId} onClick={()=>setOpen(value=>!value)}>{open?'收起路线详情':`展开全部 ${steps.length} 段路线`}<span aria-hidden="true">{open?'−':'＋'}</span></button></>}</>;
}

export default function RouteWorkbench({result,onError}:{result:Routes;onError:(message:string)=>void}){
  const [selectedId,setSelectedId]=useState(result.routes[0]?.id);
  const root=useRef<HTMLDivElement>(null),snapshot=useRef<Flip.FlipState|null>(null),transition=useRef<gsap.core.Timeline|null>(null);
  const reduced=useReducedMotion(),detailId=useId();
  const entrance=useRef<gsap.core.Tween|null>(null);
  const selected=result.routes.find(route=>route.id===selectedId)||result.routes[0];
  useGSAP(()=>{if(!reduced)entrance.current=gsap.from('.route-choices>button',{y:16,opacity:.45,duration:.45,stagger:.06,ease:'power2.out'});},{scope:root,dependencies:[reduced],revertOnUpdate:true});
  useGSAP(()=>{
    if(reduced){snapshot.current=null;return;}
    if(snapshot.current){transition.current=Flip.from(snapshot.current,{targets:root.current!.querySelectorAll('.route-choices>button,.route-detail,.route-active-line'),duration:.5,ease:'power3.inOut',absolute:'.route-active-line',nested:true});snapshot.current=null;}
    gsap.from('.route-detail-title,.route-detail-metrics,.route-timeline>li',{y:10,opacity:.5,duration:.35,stagger:.035,ease:'power2.out'});
  },{scope:root,dependencies:[selectedId,reduced],revertOnUpdate:true});
  if(!selected)return <p className="caution">没有可展示的路线，请调整地点后重试。</p>;
  function speak(){
    if(!window.speechSynthesis){onError('浏览器不支持朗读，请阅读文字路线。');return;}
    window.speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(`以下是${selected.mode}方案，未核实无障碍设施。${selected.steps.join('。')}`);utterance.lang='zh-CN';
    utterance.onerror=event=>{if(!['canceled','interrupted'].includes(event.error))onError('语音暂不可用，请阅读文字路线。');};
    window.speechSynthesis.speak(utterance);
  }
  return <div className="route-workbench" ref={root}>
    <div className="route-choices" role="group" aria-label="选择路线方案">{result.routes.map((route,index)=><button type="button" key={route.id} aria-pressed={selected.id===route.id} aria-expanded={selected.id===route.id} aria-controls={detailId} onClick={()=>{if(selected.id===route.id)return;window.speechSynthesis?.cancel();entrance.current?.progress(1);transition.current?.progress(1);snapshot.current=!reduced?Flip.getState(root.current!.querySelectorAll('.route-choices>button,.route-detail,.route-active-line')):null;setSelectedId(route.id);}}>
      <span className="route-choice-mode"><WorkbenchIcon name={route.mode==='步行'?'walk':'bus'}/>{route.mode}方案<span className="route-selected-mark" aria-hidden="true"><WorkbenchIcon name="check"/></span></span>
      <strong>{route.duration===null?'耗时未知':Math.ceil(route.duration/60)}{route.duration!==null&&<small> 分钟</small>}</strong>
      <span>{route.walkingDistance===null?'步行距离未知':`步行 ${route.walkingDistance} 米`}</span><span className="route-choice-rank">{index===0?'按当前偏好排第 1':route.id}</span>
      {selected.id===route.id&&<><span className="route-choice-expanded">当前展开 · 分段指引见下方</span><span className="route-active-line" data-flip-id="route-active-line" aria-hidden="true"/></>}
    </button>)}</div>
    <article id={detailId} className="route-detail" aria-label="选中方案详情">
      <div className="route-detail-title"><div><p className="route-id">{selected.id}</p><h3>{selected.mode}出行指引</h3></div><span className="route-detail-symbol"><WorkbenchIcon name={selected.mode==='步行'?'walk':'bus'}/></span></div>
      <div className="route-detail-metrics"><div><strong>{selected.duration===null?'耗时未知':`${Math.ceil(selected.duration/60)} 分钟`}</strong><span>预计耗时</span></div><div><strong>{selected.distance===null?'—':`${(selected.distance/1000).toFixed(2)} 公里`}</strong><span>总距离</span></div><div><strong>{selected.walkingDistance===null?'—':`${selected.walkingDistance} 米`}</strong><span>步行距离</span></div>{selected.mode!=='步行'&&<div><strong>{selected.transfers} 次</strong><span>换乘</span></div>}</div>
      {selected.legs&&selected.legs.length>0&&<RideOverview legs={selected.legs}/>}
      <RouteTimeline key={selected.id} steps={selected.steps}/>
      <div className="route-audio"><button className="button secondary route-speak" type="button" onClick={speak}><WorkbenchIcon name="voice"/>朗读当前方案</button><button className="text-button" type="button" onClick={()=>window.speechSynthesis?.cancel()}>停止朗读</button></div>
    </article>
  </div>;
}
