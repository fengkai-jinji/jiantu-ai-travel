import {useRef} from 'react';
import {createPortal} from 'react-dom';
import {MotionPathPlugin} from 'gsap/MotionPathPlugin';
import {ScrollToPlugin} from 'gsap/ScrollToPlugin';
import {gsap,useGSAP,useReducedMotion} from './motion';

gsap.registerPlugin(MotionPathPlugin,ScrollToPlugin);

export type DestinationFeedback={id:number;name:string;from:{left:number;top:number;width:number;height:number}};

export default function DestinationFlight({flight,onDone}:{flight:DestinationFeedback;onDone:()=>void}){
  const pill=useRef<HTMLDivElement>(null),reduced=useReducedMotion();
  useGSAP(context=>{
    const target=document.querySelector<HTMLInputElement>('#destination');
    if(!target){onDone();return;}
    const rect=target.getBoundingClientRect();
    const goal=rect.top>=80&&rect.bottom<innerHeight-60?scrollY:Math.max(0,Math.min(document.documentElement.scrollHeight-innerHeight,scrollY+rect.top-innerHeight*.35));
    function finish(){
      if(document.activeElement===document.body)document.querySelector<HTMLElement>('label[for="destination"]')?.focus({preventScroll:true});
      onDone();
    }
    if(reduced){window.scrollTo({top:goal,behavior:'instant'});finish();return;}
    const from={x:flight.from.left+flight.from.width/2,y:flight.from.top+flight.from.height/2};
    const to={x:rect.left+rect.width/2,y:rect.top+scrollY-goal+rect.height/2};
    gsap.set(pill.current,{xPercent:-50,yPercent:-50,x:from.x,y:from.y});
    // Navigation keeps its final scroll position when the decorative overlay unmounts.
    let scrollTween:gsap.core.Tween;
    context.ignore(()=>{scrollTween=gsap.to(window,{scrollTo:{y:goal,autoKill:true},duration:.55,ease:'power2.inOut'});});
    gsap.timeline({onComplete:finish})
      .to(pill.current,{motionPath:{path:[from,{x:(from.x+to.x)/2+Math.min(70,innerWidth*.1),y:Math.min(from.y,to.y)-65},to],curviness:1.3},duration:.85,ease:'power2.inOut'},0)
      .to(pill.current,{scale:.7,opacity:0,duration:.18,ease:'power2.in'});
    return()=>scrollTween.kill();
  },{scope:pill,dependencies:[reduced],revertOnUpdate:true});
  return createPortal(<div className="destination-flight" ref={pill} aria-hidden="true">{flight.name}</div>,document.body);
}
