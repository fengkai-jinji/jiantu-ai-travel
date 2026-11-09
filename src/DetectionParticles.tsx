import {useEffect,useRef} from 'react';
import {useReducedMotion} from './motion';
export type ParticleBox={x1:number;y1:number;x2:number;y2:number;confidence:number};
const DIG=0.8,FOCUS_END=1.8;
type Particle={x:number;y:number;hx:number;hy:number;vx:number;vy:number;r:number;g:number;b:number;inBox:boolean;edge:boolean;phase:number;boxIndex:number};
export default function DetectionParticles({image,boxes,width,height,targetName,paint}:{image:string;boxes:ParticleBox[];width:number;height:number;targetName:string;paint?:((ctx:CanvasRenderingContext2D,W:number,H:number)=>void)|null}){
  const canvas=useRef<HTMLCanvasElement>(null);
  const reduced=useReducedMotion();
  const boxesKey=JSON.stringify(boxes);
  useEffect(()=>{
    const cv=canvas.current;
    if(!cv||reduced)return;
    const ctx=cv.getContext('2d')!;
    const W=cv.width=width,H=cv.height=height;
    let cancelled=false,raf=0;
    const run=(data:Uint8ClampedArray)=>{
      const begin=performance.now();
      const lum=(x:number,y:number)=>{const i=(y*W+x)*4;return .299*data[i]+.587*data[i+1]+.114*data[i+2];};
      const step=4;
      const pts:{x:number;y:number;hx:number;hy:number;vx:number;vy:number;r:number;g:number;b:number;inBox:boolean;edge:boolean;phase:number;boxIndex:number}[]=[];
      for(let y=2;y<H-2;y+=step)for(let x=2;x<W-2;x+=step){
        const i=(y*W+x)*4;
        const l=lum(x,y);
        const edge=Math.abs(l-lum(Math.min(W-3,x+step),y))+Math.abs(l-lum(x,Math.min(H-3,y+step)))>24;
        const boxIndex=boxes.findIndex(b=>x>=b.x1&&x<=b.x2&&y>=b.y1&&y<=b.y2);
        const inBox=boxIndex>=0;
        if(!edge&&!inBox&&Math.random()>.35)continue;
        pts.push({x,y,hx:x,hy:y,vx:0,vy:0,r:data[i],g:data[i+1],b:data[i+2],inBox,edge,phase:Math.random()*6.28,boxIndex});
      }
      const tick=()=>{
        const t=performance.now()-begin;
        ctx.clearRect(0,0,W,H);
        const dig=Math.min(1,t/1000/DIG);
        const focus=Math.max(0,Math.min(1,(t/1000-DIG)/(FOCUS_END-DIG)));
        if(t<DIG*1000+300){const scanY=Math.min(H,(t/1000/(DIG+.35))*H);ctx.fillStyle='rgba(99,255,179,.35)';ctx.fillRect(0,scanY,W,2);}
        for(const p of pts){
          if(p.inBox&&focus>0){
            const b=boxes[p.boxIndex],cx=(b.x1+b.x2)/2,cy=(b.y1+b.y2)/2;
            p.x+=(p.hx+(cx-p.hx)*.16*focus-p.x)*.07;
            p.y+=(p.hy+(cy-p.hy)*.16*focus-p.y)*.07;
          }else{p.x+=(p.hx-p.x)*.06;p.y+=(p.hy-p.y)*.06;}
          const flick=p.inBox?.82+.18*Math.abs(Math.sin(t/280+p.phase)):1;
          const alpha=p.inBox?(.2+.75*focus)*flick:.85*dig*(1-focus*.92);
          let r=p.r,g=p.g,b=p.b;
          if(p.inBox&&focus>.4){const k=(focus-.4)/.6*.55;r=r*(1-k)+255*k;g=g*(1-k)+214*k;b=b*(1-k)+120*k;}
          ctx.fillStyle=`rgba(${r|0},${g|0},${b|0},${alpha})`;
          const size=p.edge?2.4:2;
          ctx.fillRect(p.x-size/2,p.y-size/2,size,size);
        }
        raf=requestAnimationFrame(tick);
      };
      tick();
    };
    if(paint){
      const off=document.createElement('canvas');off.width=W;off.height=H;
      const octx=off.getContext('2d')!;paint(octx,W,H);
      run(octx.getImageData(0,0,W,H).data);
    }else{
      const img=new Image();
      img.onload=()=>{if(cancelled)return;
        const off=document.createElement('canvas');off.width=W;off.height=H;
        const octx=off.getContext('2d')!;octx.drawImage(img,0,0,W,H);
        run(octx.getImageData(0,0,W,H).data);};
      img.src=image;
    }
    return()=>{cancelled=true;cancelAnimationFrame(raf);};
  },[image,boxesKey,boxes,width,height,targetName,paint,reduced]);
  if(reduced)return null;
  return <canvas ref={canvas} className="particle-overlay" role="img" aria-label="识别粒子薄层：汇聚到识别目标上"/>;
}
