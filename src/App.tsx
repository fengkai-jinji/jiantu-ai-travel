import {Trip,Knowledge} from './Pages';
import Home from './Home';
import {MotionProvider,gsap,attachSpotlight} from './motion';
import {Component,lazy,Suspense,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
const Vision=lazy(()=>import('./Vision'));
const OutdoorVision=lazy(()=>import('./OutdoorVision'));
const routes={home:'首页',trip:'出行助手',vision:'环境感知',indoor:'室内寻物',knowledge:'无障碍问答'};
type Page=keyof typeof routes;
function readPage():Page{const p=location.hash.slice(1);return Object.hasOwn(routes,p)?p as Page:'home';}
class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true}}render(){return this.state.failed?<div className="panel" role="alert"><h2>页面暂时出了问题</h2><button className="button" onClick={()=>location.reload()}>重新加载</button></div>:this.props.children}}
export default function App(){const [page,setPage]=useState<Page>(readPage);
  const [sysReduced,setSysReduced]=useState(()=>typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{const mq=window.matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setSysReduced(mq.matches);mq.addEventListener('change',change);return()=>mq.removeEventListener('change',change);},[]);
  const firstNav=useRef(true),hairline=useRef<HTMLDivElement>(null),mainRef=useRef<HTMLElement|null>(null);const main=mainRef as React.RefObject<HTMLElement>,dialog=useRef<HTMLDialogElement>(null);const [settings,setSettings]=useState<Record<string,boolean>>(()=>{try{const v=JSON.parse(localStorage.getItem('jiantu-react-settings')||'{}');return v&&typeof v==='object'?v:{}}catch{return {}}});
  const motionOff=!!settings['reduce-motion']||sysReduced;
  useLayoutEffect(()=>{
    if(firstNav.current){firstNav.current=false;return;}
    const el=mainRef.current,bar=hairline.current;
    window.scrollTo(0,0);mainRef.current?.focus();
    if(motionOff||!el){
      gsap.set(el,{clearProps:'opacity,transform,willChange'});
      if(bar)gsap.set(bar,{clearProps:'opacity,transform'});
      return;
    }
    if(bar)gsap.set(bar,{scaleX:0,opacity:1});
    gsap.set(el,{willChange:'opacity,transform'});
    const tween=gsap.timeline()
      .fromTo(el,{opacity:0,y:18},{opacity:1,y:0,duration:.5,ease:'expo.out',force3D:true},0)
      .to(bar,{scaleX:1,duration:.4,ease:'power2.inOut'},0)
      .to(bar,{opacity:0,duration:.16,ease:'power1.out'},'-=.08');
    return()=>{tween.kill();gsap.set(el,{clearProps:'opacity,transform,willChange'});if(bar)gsap.set(bar,{clearProps:'opacity,transform'});};
  },[page,motionOff]);
  useEffect(()=>{const change=()=>{setPage(readPage());main.current?.focus();window.scrollTo(0,0);};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change)},[]);
  useEffect(()=>{document.title=`${routes[page]} · 见途 Jiantu`},[page]);
  useEffect(()=>attachSpotlight(),[motionOff]);
  useEffect(()=>{for(const key of ['large-text','high-contrast','reduce-motion'])document.documentElement.classList.toggle(key,!!settings[key]);try{localStorage.setItem('jiantu-react-settings',JSON.stringify(settings))}catch{}},[settings]);
  return <MotionProvider reduced={!!settings['reduce-motion']}><div ref={hairline} className="page-progress" aria-hidden="true"/><a href="#main" className="skip" onClick={e=>{e.preventDefault();main.current?.focus()}}>跳至主要内容</a><div className="frame-bar"><span>JIANTU / 见途 · AI 无障碍出行助手</span><span>室内外识别已接入 · 出行助手与知识问答已接入</span></div><header><div className="header-inner"><a className="brand" href="#home"><span className="brand-mark" aria-hidden="true">途</span><div><strong>见途</strong><small>JIANTU</small></div></a><nav aria-label="主导航">{Object.entries(routes).map(([key,title])=><a key={key} href={`#${key}`} aria-current={page===key?'page':undefined}>{title}</a>)}</nav><button className="settings" onClick={()=>dialog.current?.showModal()}>无障碍设置</button></div></header><main className="main" id="main" ref={main} tabIndex={-1}><ErrorBoundary key={page}><Suspense fallback={<p role="status">正在加载页面…</p>}>{page==='home'?<Home/>:page==='trip'?<Trip/>:page==='indoor'?<Vision/>:page==='vision'?<OutdoorVision/>:<Knowledge/>}</Suspense></ErrorBoundary></main><footer className="footer"><span>见途 · AI 无障碍出行助手</span><span>出行需求为主线 · 无障碍知识面向所有人</span><small>参赛开发版 · 室外感知已接入便携推理包模型</small></footer><dialog ref={dialog} aria-labelledby="settings-title"><h2 id="settings-title">按你的习惯使用</h2><p>普通模式保留完整动效；开启“减少动态效果”后停止非必要动画，功能和内容保持完整。设置保存在当前浏览器。</p>{[['large-text','大字号'],['high-contrast','高对比度'],['reduce-motion','减少动态效果']].map(([key,label])=><label className="setting" key={key}><input type="checkbox" checked={!!settings[key]} onChange={e=>setSettings({...settings,[key]:e.target.checked})}/>{label}</label>)}<button className="button full" onClick={()=>dialog.current?.close()}>完成设置</button></dialog></MotionProvider>;
}

