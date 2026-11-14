import {createContext,useContext,useSyncExternalStore,type ReactNode} from 'react';
import gsap from 'gsap';
import {useGSAP} from '@gsap/react';

gsap.registerPlugin(useGSAP);
const ReducedMotion=createContext(false);
function subscribe(listener:()=>void){const query=window.matchMedia('(prefers-reduced-motion: reduce)');query.addEventListener('change',listener);return()=>query.removeEventListener('change',listener);}
function systemPreference(){return window.matchMedia('(prefers-reduced-motion: reduce)').matches;}
export function MotionProvider({reduced,children}:{reduced:boolean;children:ReactNode}){
  const systemReduced=useSyncExternalStore(subscribe,systemPreference,()=>false);
  return <ReducedMotion.Provider value={reduced||systemReduced}>{children}</ReducedMotion.Provider>;
}
export function useReducedMotion(){return useContext(ReducedMotion);}
export {gsap,useGSAP};
export function attachSpotlight(reduced=false){
  if(reduced||(typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches))return()=>{};
  const handler=(event:PointerEvent)=>{
    const card=(event.target as HTMLElement).closest<HTMLElement>('[data-spotlight]');
    if(!card)return;
    const rect=card.getBoundingClientRect();
    card.style.setProperty('--mx',`${event.clientX-rect.left}px`);
    card.style.setProperty('--my',`${event.clientY-rect.top}px`);
  };
  document.addEventListener('pointermove',handler);
  return()=>document.removeEventListener('pointermove',handler);
}