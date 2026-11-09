import {useEffect,useRef} from 'react';
import {useReducedMotion} from './motion';
const GLYPHS:Record<string,string>={bottle:'瓶',cup:'杯',chair:'椅',door:'门'};
type Particle={x:number;y:number;tx:number;ty:number;vx:number;vy:number;color:string};
export default function ParticleHolo({target}:{target:string}){
  const canvas=useRef<HTMLCanvasElement>(null),points=useRef<Particle[]>([]),mouse=useRef({x:-999,y:-999});
  const reduced=useReducedMotion();
  useEffect(()=>{
    const cv=canvas.current;
    if(!cv)return;
    const ctx=cv.getContext('2d')!,W=cv.width=520,H=cv.height=300;
    const off=document.createElement('canvas');off.width=W;off.height=H;
    const octx=off.getContext('2d')!;
    octx.fillStyle='#fff';octx.font='bold 200px "Noto Serif SC","SimSun",serif';
    octx.textAlign='center';octx.textBaseline='middle';
    octx.fillText(GLYPHS[target]??'途',W/2,H/2+8);
    const pixels=octx.getImageData(0,0,W,H).data;
    const targets:{x:number;y:number}[]=[];
    for(let y=0;y<H;y+=5)for(let x=0;x<W;x+=5){if(pixels[(y*W+x)*4+3]>128)targets.push({x:x+(Math.random()-.5)*2,y:y+(Math.random()-.5)*2});}
    const colors=['#63ffb3','#8fad8b','#e8bd66'];
    let pts=points.current;
    if(pts.length===0){
      pts=points.current=targets.map(t=>({x:Math.random()*W,y:Math.random()*H,tx:t.x,ty:t.y,vx:0,vy:0,color:colors[Math.floor(Math.random()*colors.length)]}));
    }else{
      pts.forEach((p,i)=>{const t=targets[i%targets.length];p.tx=t.x;p.ty=t.y;});
    }
    if(reduced){
      ctx.clearRect(0,0,W,H);ctx.fillStyle='#8fad8b';
      pts.forEach(p=>ctx.fillRect(p.tx,p.ty,2.4,2.4));
      return;
    }
    let raf=0;
    const tick=()=>{
      ctx.clearRect(0,0,W,H);
      const time=performance.now();
      for(const p of pts){
        p.vx+=(p.tx-p.x)*.02;p.vy+=(p.ty-p.y)*.02;
        const dx=p.x-mouse.current.x,dy=p.y-mouse.current.y,d2=dx*dx+dy*dy;
        if(d2<3600){const d=Math.sqrt(d2)||1,f=(60-d)/60*2.2;p.vx+=dx/d*f;p.vy+=dy/d*f;}
        p.vx*=.9;p.vy*=.9;p.x+=p.vx;p.y+=p.vy;
        ctx.fillStyle=p.color;
        ctx.globalAlpha=.5+.5*Math.abs(Math.sin(time/850+p.tx*.7));
        ctx.fillRect(p.x,p.y,2.4,2.4);
      }
      ctx.globalAlpha=1;
      raf=requestAnimationFrame(tick);
    };
    tick();
    return()=>cancelAnimationFrame(raf);
  },[target,reduced]);
  function move(event:React.PointerEvent<HTMLDivElement>){
    const rect=event.currentTarget.getBoundingClientRect();
    mouse.current={x:(event.clientX-rect.left)*(520/rect.width),y:(event.clientY-rect.top)*(300/rect.height)};
  }
  return <div className="particle-holo" onPointerMove={move} onPointerLeave={()=>{mouse.current={x:-999,y:-999};}}>
    <canvas ref={canvas} role="img" aria-label={`${GLYPHS[target]??''} 字的全息粒子投影`}/>
    <span className="holo-tag" aria-hidden="true">HOLO · {GLYPHS[target]??''}</span>
    <span className="holo-scan" aria-hidden="true"/>
  </div>;
}
