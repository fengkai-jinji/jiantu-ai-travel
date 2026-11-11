import {useEffect,useRef,useState,type FormEvent,type KeyboardEvent} from 'react';

import type {Routes,Place} from './tripTypes';
import AgentChat from './AgentChat';
import RouteWorkbench from './RouteWorkbench';
import DestinationFlight,{type DestinationFeedback} from './DestinationFlight';
import WorkbenchIcon from './WorkbenchIcon';
import './workbench.css';
async function query<T>(path:string,body:object,signal:AbortSignal):Promise<T>{
  const response=await fetch(`/trip-api/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
  const data=await response.json().catch(()=>({error:'地图服务未启动，请运行启动项目脚本。'}));
  if(!response.ok||data.error)throw new Error(data.error||'查询失败，请重试。');
  return data;
}
const TIME_CHOICES=['尽快出发','自定义时间'];
function RouteScene({loading=false}:{loading?:boolean}){
  return <svg viewBox="0 0 360 150" fill="none" aria-hidden="true"><path d="M40 112h88V47h104v65h88" stroke="#d0dfc7" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round"/><path className={loading?'loading-route-line':''} d="M40 112h88V47h104v65h88" stroke="#216b55" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><circle cx="40" cy="112" r="13" fill="#216b55"/><circle cx="40" cy="112" r="5" fill="#edf3e8"/><rect x="160" y="25" width="44" height="43" rx="12" fill="#216b55"/><path d="M171 35h22v16h-22Zm3 22h1m14 0h1" stroke="#edf3e8" strokeWidth="2"/><circle className={loading?'load-dot':''} cx="320" cy="112" r="16" fill="#e8bd66"/><path d="m313 112 5 5 10-12" stroke="#405d4b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M61 52V34m-7 9h14M279 44V30m-7 7h14" stroke="#b6cca9" strokeWidth="2" strokeLinecap="round"/></svg>;
}
function PlacePicker({id,label,placeholder,city,place,onConfirm,onDirty}:{id:string;label:string;placeholder:string;city:string;place:Place|null;onConfirm:(p:Place|null)=>void;onDirty:()=>void}){
  const [text,setText]=useState(''),[items,setItems]=useState<Place[]>([]),[open,setOpen]=useState(false);
  const [active,setActive]=useState(-1),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const listId=`${id}-list`,controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>{if(place){setText(place.name);setOpen(false);setItems([]);setError('');}},[place]);
  useEffect(()=>{
    if(!open)return;
    const keyword=text.trim();
    controller.current?.abort();
    setItems([]);setActive(-1);
    if(!city.trim()||keyword.length<2){setLoading(false);setError(city.trim()?'输入至少 2 个字开始搜索。':'请先填写所在城市。');return;}
    setLoading(true);setError('');
    const current=new AbortController();controller.current=current;
    let timeout:ReturnType<typeof setTimeout>|undefined;
    const timer=setTimeout(async()=>{
      timeout=setTimeout(()=>current.abort('timeout'),25000);
      try{
        const data=await query<{places:Place[]}>('places',{city:city.trim(),keywords:keyword},current.signal);
        if(current.signal.aborted)return;
        setItems(data.places);setActive(data.places.length?0:-1);
        if(data.places.length===0)setError('没有找到相关地点，换个说法试试。');
      }catch(e){if(!current.signal.aborted)setError((e as Error).message);else if(current.signal.reason==='timeout')setError('地点搜索超时，请重新聚焦输入框重试。');}
      finally{clearTimeout(timeout);if(controller.current===current)setLoading(false);}
    },450);
    return()=>{clearTimeout(timer);clearTimeout(timeout);current.abort();if(controller.current===current)controller.current=null;};
  },[text,open,city]);
  function pick(p:Place){if(loading||error)return;controller.current?.abort();setText(p.name);setOpen(false);setItems([]);setActive(-1);setError('');onConfirm(p);}
  function keydown(e:KeyboardEvent<HTMLInputElement>){
    if(e.nativeEvent.isComposing)return;
    if(e.key==='Escape'){setOpen(false);return;}
    if(!open){if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);}return;}
    if(loading||error||!items.length){if(['ArrowDown','ArrowUp','Enter'].includes(e.key))e.preventDefault();return;}
    if(e.key==='ArrowDown'){e.preventDefault();setActive(a=>Math.min(a+1,items.length-1));}
    else if(e.key==='ArrowUp'){e.preventDefault();setActive(a=>Math.max(a-1,0));}
    else if(e.key==='Enter'&&items[active]){e.preventDefault();e.stopPropagation();pick(items[active]);}
  }
  return <div className="form-group">
    <label htmlFor={id} tabIndex={-1}>{label}</label>
    <div className="autocomplete" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setOpen(false);}}>
      <input className="field" id={id} type="text" role="combobox" autoComplete="off" aria-autocomplete="list"
        aria-expanded={open} aria-controls={open?listId:undefined} aria-activedescendant={open&&!loading&&!error&&items[active]?`${listId}-${active}`:undefined}
        maxLength={80} placeholder={placeholder} value={text}
        onChange={e=>{controller.current?.abort();controller.current=null;const value=e.target.value;setText(value);setItems([]);setError('');setLoading(true);setOpen(true);setActive(-1);if(place&&value.trim()!==place.name)onDirty();}}
        onFocus={()=>{if(!open){setItems([]);setActive(-1);setLoading(true);setOpen(true);}}} onKeyDown={keydown}/>
      {open&&<div className="suggestions" role="listbox" id={listId} aria-label={`${label}候选地点`}>
        {loading&&<p className="hint">正在搜索高德地点…</p>}
        {!loading&&error&&<p className="hint">{error}</p>}
        {!loading&&!error&&items.map((p,i)=><button type="button" role="option" key={p.id+i} id={`${listId}-${i}`} aria-selected={i===active} className={i===active?'option active':'option'} onMouseDown={e=>e.preventDefault()} onClick={()=>pick(p)}><strong>{p.name}</strong><small>{p.address||'地址未提供'}</small></button>)}
      </div>}
    </div>
    {text.trim()&&(place===null||text.trim()!==place.name)&&<p className="fine inline-note">尚未确认：请点选下方候选，确认{label}后再查询。</p>}
    {place&&text.trim()===place.name&&<p className="fine inline-note confirmed-hint"><WorkbenchIcon name="check"/> 已确认：{place.address||place.name}</p>}
  </div>;
}
export default function Trip(){
  const [city,setCity]=useState('南京'),[cityKey,setCityKey]=useState(0);
  const [origin,setOrigin]=useState<Place|null>(null),[destination,setDestination]=useState<Place|null>(null);
  const [timeChoice,setTimeChoice]=useState('尽快出发'),[departure,setDeparture]=useState('');
  const [preferences,setPreferences]=useState<string[]>(['少换乘','关注台阶与电梯']),[needs,setNeeds]=useState(''),[agentBusy,setAgentBusy]=useState(false);
  const [result,setResult]=useState<Routes|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
  const [checked,setChecked]=useState<string[]>([]);
  const request=useRef<AbortController|null>(null);
  const [flight,setFlight]=useState<DestinationFeedback|null>(null),flightId=useRef(0);
  useEffect(()=>()=>{request.current?.abort();window.speechSynthesis?.cancel();},[]);
  function invalidate(){request.current?.abort();request.current=null;setBusy(false);setResult(null);setError('');setChecked([]);window.speechSynthesis?.cancel();}
  function confirm(side:'origin'|'destination',p:Place|null){
    const set=side==='origin'?setOrigin:setDestination,label=side==='origin'?'出发地':'目的地',other=side==='origin'?destination:origin;
    if(!p){set(null);invalidate();return;}
    invalidate();set(p);
    const from=side==='origin'?p:other,to=side==='origin'?other:p;
    setStatus(other?`起终点已确认：${from!.name} → ${to!.name}，可以查询路线了。`:`已确认${label}：${p.name}。`);
  }
  function unconfirm(side:'origin'|'destination'){
    (side==='origin'?setOrigin:setDestination)(null);invalidate();setStatus('');
  }
  async function run(work:(signal:AbortSignal)=>Promise<void>,message:string){
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setBusy(true);setError('');setResult(null);setChecked([]);setStatus(message);window.speechSynthesis?.cancel();
    const timer=setTimeout(()=>controller.abort('timeout'),30000);
    try{await work(controller.signal);}
    catch(e){if(request.current===controller){setError(controller.signal.aborted?'查询已取消或超时，请重试。':(e as Error).message);setStatus('查询未完成');}}
    finally{clearTimeout(timer);if(request.current===controller)setBusy(false);}
  }
  function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!origin||!destination){setStatus('输入时在候选里点选出发地和目的地，就可以查询路线了。');return;}
    void run(async signal=>{
      const data=await query<Routes>('compare',{origin:origin.location,destination:destination.location,city,preferences,departure:timeChoice==='自定义时间'?departure:''},signal);
      if(signal.aborted)return;setResult(data);setStatus('已获得高德路线比较结果。');
    },'正在比较高德步行与公交方案…');
  }
  const checklist=['确认目的地开放时间与实际入口','核实沿途台阶、电梯及盲道情况','出发前检查天气和临时施工信息'];
  const progressStep=result?2:(busy||(origin&&destination))?1:0;
  return <div className="functional-workbench trip-workbench">{flight&&<DestinationFlight key={flight.id} flight={flight} onDone={()=>setFlight(null)}/>}<div className="page-heading"><div><h1><span>出发之前，</span><span>先准备好。</span></h1><p>输入地点时点选高德候选，确认后再查看路线与出发前需要核实的事项。</p></div><span className="badge">步行 / 公交 / 地铁 · 出行 Agent</span></div>
    <div className="trip-layout"><section className="panel"><div className="trip-form-heading"><span><WorkbenchIcon name="compass"/></span><h2>这次想去哪里？</h2></div><form onSubmit={submit}>
      <div className="form-group"><label htmlFor="city">所在城市（本次查询同城路线）</label><input className="field" id="city" required maxLength={40} value={city} onChange={e=>{setCity(e.target.value);setOrigin(null);setDestination(null);invalidate();setCityKey(k=>k+1);setStatus('所在城市已更改，请重新确认起终点。');}}/></div>
      <PlacePicker key={`o-${cityKey}`} id="origin" label="出发地" placeholder="输入大致名称，如：三江学院" city={city} place={origin} onConfirm={p=>confirm('origin',p)} onDirty={()=>unconfirm('origin')}/>
      <PlacePicker key={`d-${cityKey}`} id="destination" label="目的地" placeholder="输入大致名称，如：雨花茂业" city={city} place={destination} onConfirm={p=>confirm('destination',p)} onDirty={()=>unconfirm('destination')}/>
      <div className="form-group"><label htmlFor="time">计划出发时间</label><select className="field" id="time" value={timeChoice} onChange={e=>{setTimeChoice(e.target.value);invalidate();}}>{TIME_CHOICES.map(o=><option key={o} value={o}>{o}</option>)}</select>{timeChoice==='自定义时间'&&<input className="field time-field" type="datetime-local" aria-label="具体出发时间（北京时间）" required value={departure} onChange={e=>{setDeparture(e.target.value);invalidate();}}/>}</div>
      <div className="form-group"><span className="label">你的出行偏好</span>{['少换乘','减少步行','优先地铁','关注台阶与电梯'].map(label=><label className="preference" key={label}><input type="checkbox" checked={preferences.includes(label)} onChange={e=>{setPreferences(e.target.checked?[...preferences,label]:preferences.filter(p=>p!==label));invalidate();}}/>{label}</label>)}</div>
      <div className="form-group"><label htmlFor="needs">还有什么需要考虑？</label><textarea className="field" id="needs" value={needs} onChange={e=>setNeeds(e.target.value)} rows={3} maxLength={300} placeholder="例如：希望提前了解入口位置。"/></div>
      <button type="submit" className="button full" disabled={busy||agentBusy}><WorkbenchIcon name="search"/>{busy?'查询中…':'比较出行方案'}</button><p className="fine">输入地点时即联网搜索高德，点选候选即确认；城市、地点与所选坐标将发送至高德。少换乘与减少步行参与公交查询和方案排序，两者都选时优先减少步行；优先地铁会把含地铁的方案排前。自定义时间按北京时间筛选公交班次。台阶与电梯仍需人工核实。</p>
    </form></section>
    <section className="panel" aria-label="路线与准备清单"><ol className="journey-progress" aria-label="出行准备进度">{['确认起终点','查询路线','行前核实'].map((label,index)=><li key={label} className={index<progressStep?'is-done':''} aria-current={index===progressStep?'step':undefined}><span className="progress-node"><WorkbenchIcon name={index<progressStep?'check':index===0?'pin':index===1?'search':'check'}/></span><span>{label}</span></li>)}</ol>
      {!agentBusy&&status&&<p className="status" role="status">{status}</p>}{error&&<p className="error" role="alert">{error}</p>}
      {busy&&<div className="route-loading" role="status"><RouteScene loading/><p>正在查询高德路线</p><small>等待实际服务返回结果，请稍候。</small></div>}
      {!result&&!busy&&!agentBusy&&!error&&<div className="route-idle"><RouteScene/><h2>下一程，从这里开始</h2><p>先确认出发地与目的地，<br/>再一起比较适合你的出行方案。</p></div>}
      {result&&<><p className="fine">{origin?.name} → {destination?.name}</p>{result.ranking&&<p className="fine">{result.ranking}</p>}{result.warnings?.map((warning,index)=><p className="caution" key={index}>{warning}</p>)}<RouteWorkbench key={result.queriedAt} result={result} onError={setError}/><p className="caution">{result.notice}</p><p className="fine">来源：{result.source}<br/>查询时间：{new Date(result.queriedAt).toLocaleString('zh-CN')}</p>
      <section className="checklist"><div className="checklist-heading"><h2>行前核实清单</h2><span className="checklist-progress" role="status">{checked.length} / {checklist.length} 已勾选</span></div><div className="checklist-bar" aria-hidden="true"><span style={{width:`${checked.length/checklist.length*100}%`}}/></div><p className="fine">通用提醒，勾选仅作个人备忘，不代表系统已核实设施。</p>{checklist.map(item=><label key={item}><input type="checkbox" checked={checked.includes(item)} onChange={e=>setChecked(e.target.checked?[...checked,item]:checked.filter(value=>value!==item))}/>{item}</label>)}</section></>}
    <AgentChat disabled={busy} context={{city,origin:origin?.location,destination:destination?.location,originName:origin?.name,destinationName:destination?.name,preferences,departure:timeChoice==='自定义时间'?departure:'',needs}} onResult={value=>{setResult(value);setChecked([]);window.speechSynthesis?.cancel();}} onBusy={setAgentBusy} onDestination={(place,from)=>{confirm('destination',place);setFlight({id:++flightId.current,name:place.name,from:{left:from.left,top:from.top,width:from.width,height:from.height}});}}/>
    </section></div></div>;
}
