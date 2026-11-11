import {useEffect,useRef,useState} from 'react';
import {Generation} from './detection';
import WorkbenchIcon from './WorkbenchIcon';
import SpatialStage from './SpatialStage';
import './workbench.css';
import {FrameConfirmation,OutdoorSpeech} from './outdoorFeedback';
import type {Observation} from './outdoorFeedback';
import {gsap,useGSAP,useReducedMotion} from './motion';

export type Level='危险'|'近'|'中';
export interface OutdoorObject{class_id:number;name:string;label:string;confidence:number;xyxy:number[];level:Level;direction:string;off_route:boolean;side:string}
export interface OutdoorResult{objects:OutdoorObject[];image:string;width:number;height:number;inference_ms:number;device:string}

const LEVEL_ORDER:Record<Level,number>={'危险':0,'近':1,'中':2};
const LEVEL_COLOR:Record<Level,string>={'危险':'#d93025','近':'#e07800','中':'#c29500'};
const LEVEL_CHIP:Record<Level,string>={'危险':'outdoor-chip-danger','近':'outdoor-chip-near','中':'outdoor-chip-mid'};

async function detectOutdoor(blob:Blob,signal:AbortSignal):Promise<OutdoorResult>{
  const response=await fetch('/outdoor-api/image?conf=0.15',{method:'POST',body:blob,signal});
  if(!response.ok){let message='室外识别服务不可用，请确认本地识别服务（8767）已启动。';try{message=(await response.json()).error||message;}catch{}throw new Error(message);}
  return response.json();
}
function say(text:string){if(!window.speechSynthesis)return false;const s=new SpeechSynthesisUtterance(text);s.lang='zh-CN';s.rate=.95;window.speechSynthesis.speak(s);return true;}
function dangerBanner(objects:OutdoorObject[]){
  const dangers=objects.filter(o=>o.level==='危险');
  if(!dangers.length)return null;
  const first=dangers[0];
  const base=first.name==='puddle'?'危险！小心脚下，水坑':`危险！${first.direction}有${first.label}，请停下`;
  return dangers.length>1?`${base} 等${dangers.length}处`:base;
}
function summarize(objects:OutdoorObject[]){
  if(!objects.length)return '本帧未检出目标，仍需持续观察。';
  const count:Record<Level,number>={'危险':0,'近':0,'中':0};
  for(const o of objects)count[o.level]++;
  const parts:string[]=[];
  if(count['危险'])parts.push(`危险 ${count['危险']} 处`);
  if(count['近'])parts.push(`近级 ${count['近']} 处`);
  if(count['中'])parts.push(`中级 ${count['中']} 处`);
  return `前方检出 ${objects.length} 项目标：${parts.join('、')}。`;
}

export default function OutdoorVision(){
  const [result,setResult]=useState<OutdoorResult|null>(null);
  const [status,setStatus]=useState('选择照片或打开摄像头，开始感知街面。'),[running,setRunning]=useState(false),[error,setError]=useState('');
  const [preview,setPreview]=useState<string|null>(null),[processing,setProcessing]=useState(false);
  const [auto,setAuto]=useState(true);
  const [observations,setObservations]=useState<Observation<OutdoorObject>[]>([]),[source,setSource]=useState<'live'|'photo'>('photo');
  const workspace=useRef<HTMLDivElement>(null),reduced=useReducedMotion();
  const video=useRef<HTMLVideoElement>(null),canvas=useRef<HTMLCanvasElement>(null);
  const stream=useRef<MediaStream|null>(null),request=useRef<AbortController|null>(null),generation=useRef(new Generation());
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null),autoRef=useRef(auto);
  const confirmation=useRef(new FrameConfirmation()),speech=useRef(new OutdoorSpeech());
  autoRef.current=auto;
  useGSAP(()=>{if(!reduced)gsap.from('.viewer-heading,.viewer .upload,.scene-toolbar',{y:16,opacity:.6,duration:.55,stagger:.09,ease:'power2.out'});},{scope:workspace,dependencies:[reduced],revertOnUpdate:true});
  useGSAP(()=>{if(!reduced&&preview&&!result)gsap.from('.photo-preview',{opacity:.5,scale:1.025,duration:.45,ease:'power2.out'});},{scope:workspace,dependencies:[preview,!!result,reduced],revertOnUpdate:true});

  function stop(){generation.current.next();request.current?.abort();if(timer.current)clearTimeout(timer.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(video.current)video.current.srcObject=null;window.speechSynthesis?.cancel();speech.current.reset();confirmation.current.reset();setObservations([]);setRunning(false);setProcessing(false);setPreview(null);setResult(null);setStatus('已停止，摄像头已释放。');}
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
  useEffect(()=>{const hidden=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',stop);return()=>{stop();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',stop);};},[]);

  // 只用连续确认后的实际检测证据播报，保留所有原始检测框用于文字与画布。
  function announce(objects:OutdoorObject[],live:boolean){
    if(!window.speechSynthesis)return;
    const plan=speech.current.plan(objects,live,Date.now(),window.speechSynthesis.speaking||window.speechSynthesis.pending,autoRef.current);
    if(!plan.text)return;
    if(plan.interrupt)window.speechSynthesis.cancel();
    say(plan.text);
  }

  // 画布：按级别配色画检测框
  useEffect(()=>{if(!result||!canvas.current)return;let valid=true;const image=new Image();image.onload=()=>{if(!valid||!canvas.current)return;const c=canvas.current;c.width=result.width;c.height=result.height;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);const font=Math.max(18,result.width/38);ctx.font=`bold ${font}px sans-serif`;ctx.lineWidth=3;for(const o of result.objects){const [x1,y1,x2,y2]=o.xyxy;ctx.strokeStyle=LEVEL_COLOR[o.level];ctx.strokeRect(x1,y1,x2-x1,y2-y1);const text=`${o.label}·${o.level} ${Math.round(o.confidence*100)}%`,y=Math.max(font+8,y1);ctx.fillStyle=LEVEL_COLOR[o.level];ctx.fillRect(x1,y-font-6,ctx.measureText(text).width+12,font+10);ctx.fillStyle='white';ctx.fillText(text,x1+6,y);}};image.src=result.image.startsWith('data:')?result.image:`data:image/jpeg;base64,${result.image}`;return()=>{valid=false;};},[result]);

  async function predict(blob:Blob,id:number,live:boolean){const controller=new AbortController();request.current=controller;setProcessing(true);const timeout=setTimeout(()=>controller.abort(),30000);try{const data=await detectOutdoor(blob,controller.signal);if(!generation.current.current(id))return;const evidence=confirmation.current.update(data.objects,live);setObservations(evidence);setSource(live?'live':'photo');setResult(data);setStatus(live?'摄像头感知中 · 最新采样帧':'照片识别完成');setError('');announce(evidence.filter(item=>item.confirmed).map(item=>item.object),live);}catch(e){if(!generation.current.current(id))return;throw new Error(controller.signal.aborted?'识别超时，请重试。':(e as Error).message);}finally{clearTimeout(timeout);if(generation.current.current(id))setProcessing(false);}}
  async function upload(file?:File){if(!file)return;stop();setError('');if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024){setError('请选择 12 MB 以内的 JPG、PNG 或 WebP 照片。');return;}setPreview(URL.createObjectURL(file));const id=generation.current.next();setRunning(true);setStatus('正在识别照片…');try{await predict(file,id,false);}catch(e){if(generation.current.current(id)){setError((e as Error).message);setStatus('识别失败');}}finally{if(generation.current.current(id))setRunning(false);}}
  async function camera(){stop();setError('');setRunning(true);setStatus('等待摄像头权限…');const id=generation.current.next();try{if(!navigator.mediaDevices?.getUserMedia)throw new Error('摄像头需要 localhost 或 HTTPS。');const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:960}},audio:false});if(!generation.current.current(id)){media.getTracks().forEach(t=>t.stop());return;}stream.current=media;video.current!.srcObject=media;await video.current!.play();setStatus('摄像头已连接，正在感知…');const frame=document.createElement('canvas');const tick=async()=>{if(!generation.current.current(id)||!video.current)return;try{const v=video.current;frame.width=v.videoWidth;frame.height=v.videoHeight;if(frame.width&&frame.height){frame.getContext('2d')!.drawImage(v,0,0);const blob=await new Promise<Blob|null>(resolve=>frame.toBlob(resolve,'image/jpeg',.8));if(blob&&generation.current.current(id))await predict(blob,id,true);}if(generation.current.current(id))timer.current=setTimeout(tick,600);}catch(e){if(generation.current.current(id)){stop();setError((e as Error).message);}}};await tick();}catch(e){if(generation.current.current(id)){stop();setError((e as Error).name==='NotAllowedError'?'未获得摄像头权限，可以改用照片。':(e as Error).message);}}}

  const banner=result?dangerBanner(result.objects):null;
  const ordered=result?[...result.objects].sort((a,b)=>LEVEL_ORDER[a.level]-LEVEL_ORDER[b.level]):[];

  return <div className="functional-workbench vision-workbench outdoor-workbench" ref={workspace}><div className="page-heading"><div><h1><span>看清街面，</span><span>提前一步提醒。</span></h1><p>把镜头对准前方道路，识别障碍、行人、水坑与车辆，按二维检测框规则分级提示，不测量实际距离。</p></div><span className="badge">室外感知 · 四类目标分级预警</span></div>
    <div className="split"><section className="panel viewer"><div className="viewer-heading"><h2>眼前的街面</h2><span className="viewer-live-status" data-running={running}>{running?(processing?'正在识别':result?'摄像头已连接':'正在连接'):result?'识别完成':preview?'待重新识别':'等待输入'}</span></div><div className="screen scene"><video ref={video} muted playsInline className="visually-hidden" aria-hidden="true"/>{!result&&!preview&&!running?<SpatialStage kind="outdoor"/>:result?<canvas ref={canvas} aria-label="室外障碍检测结果"/>:<>{preview?<img className="photo-preview" src={preview} alt="本次上传照片的本地预览"/>:<img src="./assets/outdoor.svg" alt="包含行人、车辆与水坑的街面插画"/>}<span className="vision-frame-corner" aria-hidden="true"/><span className="vision-frame-corner" aria-hidden="true"/><span className="badge">{preview?'照片预览':running?'等待实际画面':'街面插画 · 等待输入'}</span></>}{banner&&<div className="outdoor-danger-banner" role="alert">{source==='live'&&observations.some(item=>item.object.level==='危险'&&!item.confirmed)?'单帧提示 · ':''}{banner}</div>}{processing&&!result&&<div className="vision-scanner" aria-hidden="true"/>}</div>
      <div className="scene-toolbar"><button type="button" className="button camera-start" onClick={()=>void camera()} disabled={running}><WorkbenchIcon name="camera"/>打开摄像头</button><button type="button" className="button secondary" onClick={stop} disabled={!running}><WorkbenchIcon name="stop"/>停止识别</button></div>
      <label className="upload"><span className="upload-heading"><WorkbenchIcon name="photo"/>或者，选择一张街面照片</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label>
      <p role="status" className="status">{status}</p>{error&&<p role="alert" className="error">{error}</p>}
      <p className="fine">照片和采样帧发送至本机便携推理包模型（YOLOv8n · 障碍／行人／水坑／车辆）。当前不使用云端识别。{result&&`本帧模型推理：${result.inference_ms.toFixed(0)} ms。`}</p>
    </section><aside className="panel"><h2>当前目标</h2><div className="sample-result"><p role="status">{result?summarize(result.objects):processing?'正在识别，请等待实际结果。':'等待照片或摄像头画面。'}</p>{result&&ordered.length>0&&<ul className="detection-list outdoor-target-list">{ordered.map((o,index)=><li key={index}><span className={`outdoor-chip ${LEVEL_CHIP[o.level]}`}>{o.level}</span>{o.label} · {o.direction} · 置信度 {Math.round(o.confidence*100)}%{o.off_route&&<span className="outdoor-off-route">画面边缘</span>}</li>)}</ul>}{result&&ordered.length===0&&<p className="fine">本帧未检出目标，不代表道路安全。</p>}</div>
      <h2>确认与依据</h2><div className="sample-result" aria-live="polite"><p>{!result?'等待真实识别结果。':source==='photo'?'照片 · 单帧独立判断，不代表连续确认。':`实时采样 · ${observations.filter(item=>item.confirmed).length} 项连续两帧确认，${observations.filter(item=>!item.confirmed).length} 项待下一帧。`}</p>{result&&observations.length>0&&<ul className="detection-list">{observations.map(({object:o,confirmed},index)=><li key={index}>{o.label} · {o.direction} · {source==='photo'?'照片单帧':confirmed?'连续两帧确认':'首帧待确认'}<small> · 依据：框底 {Math.round(o.xyxy[3]/result.height*100)}%，框高 {Math.round((o.xyxy[3]-o.xyxy[1])/result.height*100)}%</small></li>)}</ul>}<p className="fine">实时按类别与方位在相邻两次成功采样中出现确认；不是实体追踪，也不确认真实距离。服务返回的全部原始检测框始终保留，不插值、不补造目标。服务原有远目标过滤规则未改。</p></div>
      <h2>分级说明</h2><div className="outdoor-legend">
        <div><span className="outdoor-dot" style={{background:LEVEL_COLOR['中']}}/><div><strong>中 · 二维框中级提示</strong><small>框底 ≥ 48% 时进入中级；仅画面提示</small></div></div>
        <div><span className="outdoor-dot" style={{background:LEVEL_COLOR['近']}}/><div><strong>近 · 二维框近级提示</strong><small>框底 ≥ 66% 或框高 ≥ 34%；确认后提醒</small></div></div>
        <div><span className="outdoor-dot" style={{background:LEVEL_COLOR['危险']}}/><div><strong>危险 · 二维框高优先提示</strong><small>框底 ≥ 88% 或框高 ≥ 55%；新危险抢占</small></div></div>
      </div>
      <p className="fine">上述比例相对整张画面，危险规则优先；水坑框底达到 42% 时至少按近级处理。方位取框中心所在的画面左、中、右三分区。</p>
      <h2>语音提示</h2><p className="lead">{result?summarize(result.objects):'照片按单帧结果播报；实时模式按连续两帧证据播报危险与近级目标。'}</p>
      <label className="setting"><input type="checkbox" checked={auto} onChange={e=>{setAuto(e.target.checked);if(!e.target.checked){autoRef.current=false;window.speechSynthesis?.cancel();speech.current.reset();}}}/>自动播报危险与近级目标</label>
      {result&&<div className="scene-toolbar"><button className="button secondary" onClick={()=>{if(!say(summarize(result.objects)))setError('当前浏览器不支持语音，请阅读文字结果。');}}>朗读结果</button><button className="text-button" onClick={()=>window.speechSynthesis?.cancel()}>停止朗读</button></div>}
      <div className="caution">级别来自二维框底部位置与框高规则，不是测距，不能换算为准确米数；镜头角度与物体大小会影响结果。不替代盲杖与陪同判断，未检出不代表道路安全。</div><p className="fine">“画面边缘”只表示车辆框中心在画面两侧，不能推断路线外或车辆静止；边缘车辆仍参与近级与危险提示。</p>
    </aside></div></div>;
}
