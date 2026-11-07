import {useRef,useState} from 'react';
import {gsap,useGSAP,useReducedMotion} from './motion';
import {DrawSVGPlugin} from 'gsap/DrawSVGPlugin';
import {MotionPathPlugin} from 'gsap/MotionPathPlugin';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
gsap.registerPlugin(DrawSVGPlugin,MotionPathPlugin,ScrollTrigger);
import './home.css';

const preparation=[
  {title:'说说你的需求',text:'“我想去图书馆，希望少换乘。”先说出目的地，以及你在意的出行条件。'},
  {title:'一起比较路线',text:'比较步行、公交与换乘方案。有关电梯、盲道等设施的信息，仍需在出发前核实。'},
  {title:'带着清单出发',text:'整理需要确认的设施、随身物品与求助方式，让出发前的准备更具体。'},
];

function CityScene({step,onSelect}:{step:number;onSelect:(step:number)=>void}){
  const hotspot=(index:number,label:string,x:number,y:number)=><g className="city-hotspot" role="button" tabIndex={0} aria-label={label} aria-pressed={step===index} onClick={()=>onSelect(index)} onKeyDown={event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();onSelect(index);}}}><circle cx={x} cy={y} r="23" fill="transparent"/><circle className="city-focus-ring" cx={x} cy={y} r="18" fill="none" stroke="#216b55" strokeWidth="2" strokeDasharray="3 4"/></g>;
  return <svg className={`journey-city city-step-${step}`} viewBox="0 0 600 390" role="group" aria-labelledby="journey-city-title">
    <title id="journey-city-title">城市出行流程插画：从家经过公交站到图书馆。虚构路线，不是实际地图。</title>
    <defs>
      <pattern id="city-windows" width="25" height="27" patternUnits="userSpaceOnUse"><rect x="7" y="7" width="10" height="13" rx="2" fill="#f7f9f4"/></pattern>
      <g id="city-tree"><path d="M0 0v35" stroke="#737d59" strokeWidth="5" strokeLinecap="round"/><ellipse cy="-12" rx="18" ry="26" fill="#6f9876"/><ellipse cx="-5" cy="-19" rx="11" ry="18" fill="#9dbb8b"/></g>
    </defs>
    <path d="M18 250 195 119 580 206 395 365Z" fill="#dbe7d3"/>
    <path d="M18 250v15l377 115v-15Zm377 115 185-159v15L395 380Z" fill="#c7d9be"/>
    <path d="m52 252 163-107 315 74-154 119Z" fill="#edf3e8"/>
    <path d="m92 238 138-80 268 67-129 96Z" fill="#d4dfcf"/>
    <path d="m63 276 156-99 278 68M192 141l-6 200m158-167-18 204" fill="none" stroke="#f7f9f4" strokeWidth="20"/>
    <path d="m63 276 156-99 278 68" fill="none" stroke="#bdcdb6" strokeWidth="2" strokeDasharray="7 9"/>
    <g className="city-parallax" data-depth="1.2"><g className="city-building building-home">
      <path d="m82 181 50-30 55 17v72l-50 31-55-18Z" fill="#e9d9b8"/><path d="m137 198 50-30v72l-50 31Z" fill="#c6b792"/>
      <path d="m74 180 52-47 65 32-54 35Z" fill="#336d56"/><path d="m74 180 63 20v8l-63-20Z" fill="#24513e"/>
      <path d="m102 224 18 5v35l-18-6Z" fill="#49775e"/><path d="m91 197 14 4v16l-14-4Zm32 9 12 4v15l-12-4Z" fill="#f7f9f4"/><path d="m149 212 13-8v17l-13 8Z" fill="#edf3e8"/>
    </g></g>
    <g className="city-parallax" data-depth=".6"><g className="city-building building-back"><path d="m226 111 37-22 49 14v90l-38 24-48-15Z" fill="#a9bfa1"/><path d="m274 125 38-22v90l-38 24Z" fill="#7d9e7e"/><path d="m226 111 48 14 38-22-49-14Z" fill="#d0ddbf"/><path d="M233 124h34v76h-34Z" fill="url(#city-windows)"/></g></g>
    <g className="city-parallax" data-depth="1"><g className="city-building building-library">
      <path d="m390 159 56-32 86 25v77l-56 35-86-26Z" fill="#e6d9b8"/><path d="m476 184 56-32v77l-56 35Z" fill="#c5b78d"/>
      <path d="m382 157 59-45 99 37-64 39Z" fill="#598269"/><path d="m382 157 94 31v9l-94-31Z" fill="#36654e"/>
      <path d="m405 185 9 3v44l-9-3Zm23 7 9 3v44l-9-3Zm25 8 9 3v44l-9-3Z" fill="#fbf6e8"/><path d="m487 199 12-7v20l-12 7Zm22-13 12-7v20l-12 7Z" fill="#edf3e8"/>
      <path d="m385 240 91 28 60-36v9l-60 37-91-29Z" fill="#bfb28f"/>
    </g></g>
    <path d="m206 280 55-34 51 15-53 37Z" fill="#bdd0ae"/>
    <use href="#city-tree" x="232" y="265"/><use href="#city-tree" x="278" y="281"/><use href="#city-tree" x="354" y="207"/><use href="#city-tree" x="550" y="260"/><use href="#city-tree" x="65" y="292"/><use href="#city-tree" x="390" y="330"/>
    <g className="city-stop"><path d="M326 229v46m-12-42 31 9" stroke="#53765d" strokeWidth="4"/><path d="m309 222 23-14 28 9-23 14Z" fill="#336d56"/><path d="m337 231 23-14v27l-23 14Z" fill="#d4e1cc"/><path d="m310 256 27 8 15-9" fill="none" stroke="#53765d" strokeWidth="4"/></g>
    <path d="m142 275 77-49 109 32 109-65" fill="none" stroke="#b5c8a8" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
    <path className="journey-path" d="m142 275 77-49 109 32 109-65" fill="none" stroke="#216b55" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
    <g className="city-bus"><path d="m250 211 24-14 58 18v30l-24 15-58-18Z" fill="#e8bd66"/><path d="m308 230 24-15v30l-24 15Z" fill="#c79b45"/><path d="m257 216 44 13v13l-44-13Zm58 15 11-7v13l-11 7Z" fill="#3c6a59"/><path d="m270 219 1 13m15-9v13" stroke="#e8bd66" strokeWidth="3"/><ellipse cx="264" cy="245" rx="5" ry="7" fill="#2e4b3e"/><ellipse cx="299" cy="255" rx="5" ry="7" fill="#2e4b3e"/></g>
    <g className="city-person"><circle cx="173" cy="268" r="5" fill="#bd926a"/><path d="m171 276-2 16m3-13 10 6m-13 7-7 12m8-12 6 13" fill="none" stroke="#335f4a" strokeWidth="5" strokeLinecap="round"/><path d="m182 285 13 25" stroke="#f7f9f4" strokeWidth="3" strokeLinecap="round"/></g>
    <g className="city-pin pin-start"><circle cx="142" cy="275" r="8" fill="#f7f9f4"/><circle cx="142" cy="275" r="4" fill="#216b55"/></g>
    <g className="city-pin pin-end"><path d="M437 163c-12 0-18 8-18 18 0 14 18 26 18 26s18-12 18-26c0-10-6-18-18-18Z" fill="#216b55"/><circle cx="437" cy="181" r="6" fill="#f7f9f4"/></g>
    <g fill="#324f3e" fontSize="13"><text x="62" y="331">从这里出发</text><text x="451" y="101">图书馆</text><text x="321" y="302">公交站</text></g>
    <g className="journey-traveler" transform="translate(437 193)"><path d="M0-7 6 6 0 3-6 3Z" fill="#e8bd66" stroke="#f7f9f4" strokeWidth="2"/></g>
    <path d="m112 99 6-3 6 3m227-29 7-4 7 4" fill="none" stroke="#7d9e7e" strokeWidth="2" strokeLinecap="round"/>
    {hotspot(0,'聚焦出发地示意：说明需求',142,275)}{hotspot(1,'聚焦公交站示意：比较路线',337,240)}{hotspot(2,'聚焦图书馆示意：准备清单',437,181)}
  </svg>;
}

function SceneDrawing({type}:{type:'trip'|'vision'|'indoor'}){
  return <svg className="home-scene" viewBox="0 0 320 150" fill="none" aria-hidden="true">
    {type==='trip'?<><path d="m15 123 90-45 108 33 92-54" stroke="#bfd1b6" strokeWidth="22"/><path d="m15 123 90-45 108 33 92-54" stroke="#216b55" strokeWidth="3" strokeDasharray="6 8"/><rect x="118" y="45" width="101" height="63" rx="12" fill="#e9be6a"/><path d="M130 56h75v26h-75Z" fill="#4e7a65"/><path d="M153 56v26m26-26v26" stroke="#e9be6a" strokeWidth="5"/><circle cx="140" cy="109" r="10" fill="#284c3c"/><circle cx="196" cy="109" r="10" fill="#284c3c"/><path d="M267 29c-11 0-18 8-18 18 0 14 18 28 18 28s18-14 18-28c0-10-7-18-18-18Z" fill="#216b55"/><circle cx="267" cy="46" r="6" fill="#edf3e8"/></>:type==='vision'?<><path d="M20 136 125 78h67l105 58" fill="#d2dfc7"/><path d="m123 144 31-64m47 64-28-64" stroke="#f7f9f4" strokeWidth="5"/><path d="M54 109V62m215 47V52" stroke="#86916b" strokeWidth="5"/><ellipse cx="54" cy="51" rx="25" ry="33" fill="#8eae7e"/><ellipse cx="269" cy="40" rx="24" ry="31" fill="#6c9473"/><rect x="125" y="27" width="66" height="91" rx="12" fill="#285b45"/><rect x="131" y="34" width="54" height="73" rx="6" fill="#e2ecd9"/><path d="M139 57V44h12m26 13V44h-12m12 41v13h-12m-26-13v13h12" stroke="#216b55" strokeWidth="3"/><path d="m150 79 8-10 9 10v14h-17Z" fill="#91b180"/><circle cx="158" cy="112" r="2" fill="#edf3e8"/></>:<><path d="m41 119 95-41 143 41-94 31Z" fill="#d4e0ca"/><path d="M72 105V28h77v91m-67-12V40h55v73" stroke="#9ab18a" strokeWidth="6"/><circle cx="129" cy="78" r="3" fill="#216b55"/><path d="M193 92V59h48v33m-53 1h59m-51 1v37m45-37v37" stroke="#50775b" strokeWidth="7" strokeLinecap="round"/><path d="M161 98V75h16v23m-14-23v-9h12v9" fill="#e9be6a" stroke="#c39b4d" strokeWidth="3"/><path d="M151 63v-8h12m23 8v-8h-12m12 44v9h-12m-23-9v9h12" stroke="#216b55" strokeWidth="2"/></>}
  </svg>;
}

export default function Home(){
  const [step,setStep]=useState(0),[replay,setReplay]=useState(0);
  const home=useRef<HTMLDivElement>(null);
  const reduced=useReducedMotion();
  useGSAP(()=>{
    if(reduced)return;
    gsap.from('.home-intro>[data-home-reveal]',{y:24,opacity:.45,duration:.75,stagger:.1,ease:'power3.out'});
    gsap.from('.journey-preview',{y:24,opacity:.55,duration:.85,ease:'power3.out'});
    for(const element of home.current!.querySelectorAll('.home-tools [data-home-reveal],.home-knowledge')){
      gsap.from(element,{y:25,opacity:.5,immediateRender:false,duration:.65,ease:'power2.out',scrollTrigger:{trigger:element,start:'top 94%',once:true}});
    }
    const resize=new ResizeObserver(()=>ScrollTrigger.refresh());resize.observe(home.current!);
    return()=>resize.disconnect();
  },{scope:home,dependencies:[reduced],revertOnUpdate:true});
  useGSAP(()=>{
    if(reduced)return;
    const path=home.current!.querySelector<SVGPathElement>('.journey-path')!;
    const timeline=gsap.timeline({defaults:{ease:'power2.out'}});
    timeline.from('.city-building',{y:20,opacity:0,duration:.65,stagger:.09},0)
      .fromTo(path,{drawSVG:'0%'},{drawSVG:'100%',duration:2.1,ease:'none'},.35)
      .to('.journey-traveler',{motionPath:{path,align:path,alignOrigin:[.5,.5],autoRotate:90},duration:2.1,ease:'none'},.35)
      .to('.city-bus',{motionPath:{path,align:path,alignOrigin:[.5,.8],start:.18,end:.64},duration:1.6,ease:'power1.inOut'},.65)
      .from('.pin-end',{scale:.6,opacity:0,transformOrigin:'50% 100%',duration:.45,ease:'back.out(1.6)'},2.25);
  },{scope:home,dependencies:[replay,reduced],revertOnUpdate:true});
  useGSAP(()=>{if(!reduced)gsap.from('.journey-story>*',{y:9,opacity:.45,duration:.35,stagger:.04});},{scope:home,dependencies:[step,reduced],revertOnUpdate:true});
  useGSAP(()=>{
    if(reduced)return;
    gsap.to('.city-camera',{x:[14,0,-14][step],y:[3,0,5][step],scale:step===1?1:1.04,duration:.65,ease:'power3.inOut'});
  },{scope:home,dependencies:[step,reduced],revertOnUpdate:true});
  useGSAP(()=>{
    if(reduced)return;
    const media=gsap.matchMedia();
    media.add('(hover: hover) and (pointer: fine)',()=>{
      const stage=home.current!.querySelector<HTMLElement>('.city-stage')!;
      const tilt=stage.querySelector('.city-tilt')!;
      const rotateX=gsap.quickTo(tilt,'rotationX',{duration:.55,ease:'power3.out'}),rotateY=gsap.quickTo(tilt,'rotationY',{duration:.55,ease:'power3.out'});
      const layers=Array.from(stage.querySelectorAll<SVGGElement>('.city-parallax')).map(element=>({depth:Number(element.dataset.depth),x:gsap.quickTo(element,'x',{duration:.65,ease:'power3.out'}),y:gsap.quickTo(element,'y',{duration:.65,ease:'power3.out'})}));
      function move(event:PointerEvent){const rect=stage.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width-.5,y=(event.clientY-rect.top)/rect.height-.5;rotateX(-y*10);rotateY(x*12);layers.forEach(layer=>{layer.x(x*12*layer.depth);layer.y(y*8*layer.depth);});}
      function reset(){rotateX(0);rotateY(0);layers.forEach(layer=>{layer.x(0);layer.y(0);});}
      stage.addEventListener('pointermove',move);stage.addEventListener('pointerleave',reset);
      return()=>{stage.removeEventListener('pointermove',move);stage.removeEventListener('pointerleave',reset);};
    });
    return()=>media.revert();
  },{scope:home,dependencies:[reduced],revertOnUpdate:true});
  return <div className="home-upgrade" ref={home}>
    <section className="hero home-hero">
      <div className="home-intro">
        <h1 data-home-reveal>让每一次出发，<br/>都更从容。</h1>
        <p className="lead" data-home-reveal>说出目的地与需求，一起做好出行准备。<br/>从路线比较，到眼前环境，让帮助更具体。</p>
        <div className="hero-actions" data-home-reveal><a className="button" href="#trip">帮我规划出行 <span aria-hidden="true">↗</span></a><a className="home-secondary" href="#knowledge">了解无障碍 <span aria-hidden="true">→</span></a></div>
        <p className="fine" data-home-reveal>为视障者及陪同者设计<br/>每个人都可以了解和使用</p>
      </div>
      <div className="journey-preview" data-home-reveal>
        <div className="journey-heading"><h2>把准备，变成一条路</h2><span>流程示意</span></div>
        <div className="journey-picture"><div className="city-stage"><div className="city-camera"><div className="city-tilt"><CityScene step={step} onSelect={setStep}/></div></div></div></div>
        <div className="journey-caption"><span>虚构路线 · 设施信息待核实</span><button type="button" className="journey-replay" onClick={()=>setReplay(value=>value+1)}><span aria-hidden="true">↻</span> 重播动画</button></div>
        <div className="journey-story" aria-live="polite" aria-atomic="true"><h3>{preparation[step].title}</h3><p>{preparation[step].text}</p></div>
        <div className="journey-steps" role="group" aria-label="查看出行准备流程">{['说明需求','比较路线','准备清单'].map((label,index)=><button key={label} type="button" aria-pressed={step===index} onClick={()=>setStep(index)}><span className="journey-step-dot" aria-hidden="true"/>{label}</button>)}</div>
      </div>
    </section>
    <section className="home-tools">
      <div className="section-title" data-home-reveal><h2>围绕出行，恰好帮到你</h2><p>出发前、行走时，还有日常生活里。</p></div>
      <div className="home-task-grid">
        <a className="home-task" href="#trip" data-home-reveal><SceneDrawing type="trip"/><div className="home-task-copy"><h3>准备一次出行</h3><p>说明目的地与偏好，比较路线，<br/>整理出发前的准备清单。</p><span>进入出行助手 <span aria-hidden="true">↗</span></span></div></a>
        <a className="home-task" href="#vision" data-home-reveal><SceneDrawing type="vision"/><div className="home-task-copy"><h3>了解眼前环境</h3><p>了解室外感知的使用方式，<br/>查看接入进度与能力边界。</p><span>查看环境感知 <span aria-hidden="true">↗</span></span></div></a>
        <a className="home-task" href="#indoor" data-home-reveal><SceneDrawing type="indoor"/><div className="home-task-copy"><h3>寻找身边物品</h3><p>选择瓶／杯、椅子或房门，<br/>了解目标在画面中的位置。</p><span>进入室内寻物 <span aria-hidden="true">↗</span></span></div></a>
      </div>
    </section>
    <section className="home-knowledge" data-home-reveal><div><h2>陪伴，从理解开始。</h2><p>如何开口询问？怎样描述方向？<br/>在无障碍问答中，找到有依据的解释。</p></div><a className="button" href="#knowledge">向 AI 提问 <span aria-hidden="true">↗</span></a><svg viewBox="0 0 180 160" fill="none" aria-hidden="true"><path d="M25 31h106v66H75l-26 23V97H25Z" fill="#b7cdb0"/><path d="M73 65h85v56h-20v21l-25-21H73Z" fill="#779e7d"/><path d="M45 51h63M45 66h38m12 20h42m-42 15h26" stroke="#edf3e8" strokeWidth="5" strokeLinecap="round"/></svg></section>
  </div>;
}
