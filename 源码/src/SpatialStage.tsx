import {useEffect,useRef,useState} from 'react';
import {useReducedMotion} from './motion';
import './spatial.css';

export default function SpatialStage({kind,target='chair'}:{kind:'outdoor'|'indoor';target?:string}){
  const host=useRef<HTMLDivElement>(null),[view,setView]=useState(0),[ready,setReady]=useState(false);
  const reduced=useReducedMotion(),viewRef=useRef(view),redraw=useRef(()=>{});
  viewRef.current=view;
  useEffect(()=>redraw.current(),[view]);
  useEffect(()=>{
    let disposed=false,cleanup=()=>{};
    setReady(false);
    import('three').then(T=>{
      if(disposed||!host.current)return;
      const element=host.current;
      let renderer:any;
      try{renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{return;}
      renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
      renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
      renderer.outputColorSpace=T.SRGBColorSpace;renderer.setClearColor(0x000000,0);
      renderer.domElement.setAttribute('aria-hidden','true');element.appendChild(renderer.domElement);
      const scene=new T.Scene(),world=new T.Group();scene.add(world);
      const camera=new T.PerspectiveCamera(36,1,.1,100);
      scene.add(new T.HemisphereLight(0xfff9e8,0x70998a,2.2));
      const sun=new T.DirectionalLight(0xfff3cf,2.6);sun.position.set(-3,8,5);sun.castShadow=true;
      sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-5;sun.shadow.camera.right=5;sun.shadow.camera.top=5;sun.shadow.camera.bottom=-5;sun.shadow.normalBias=.04;sun.shadow.bias=-.0002;scene.add(sun);
      const materials=new Map<number,any>();
      function material(color:number){if(!materials.has(color))materials.set(color,new T.MeshStandardMaterial({color,roughness:.68,metalness:.04}));return materials.get(color);}
      function mesh(geometry:any,color:number,x:number,y:number,z:number,parent=world){const object=new T.Mesh(geometry,material(color));object.position.set(x,y,z);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;}
      const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:number,parent=world)=>mesh(new T.BoxGeometry(w,h,d),color,x,y,z,parent);
      const ball=(x:number,y:number,z:number,r:number,color:number)=>mesh(new T.SphereGeometry(r,24,16),color,x,y,z);
      const cylinder=(x:number,y:number,z:number,r:number,h:number,color:number)=>mesh(new T.CylinderGeometry(r,r,h,24),color,x,y,z);
      const ground=box(0,-.14,0,5.2,.28,4.1,0xb7c8ae);
      const plinth=box(0,-.37,0,5.4,.18,4.3,0xede8da);plinth.castShadow=false;
      const floating=new T.Group();world.add(floating);
      let focus=new T.Vector3(0,.5,0);
      if(kind==='outdoor'){
        box(0,.015,0,1.9,.04,4,0xe7e3d5);
        for(let z=-1.6;z<2;z+=.55)box(0,.042,z,1.82,.006,.012,0xc3c7b6);
        for(const x of [-1.02,1.02])box(x,.04,0,.06,.08,4,0xfaf4df);
        for(const [x,z] of [[-1.7,-1.3],[1.7,-1.3],[-1.7,.2],[1.7,.2]]){
          cylinder(x,.55,z,.08,1.1,0x8d8a61);ball(x,1.37,z,.46,0x557e61);ball(x-.16,1.61,z-.08,.33,0x9cb386);
        }
        box(0,1.1,-2,2.4,2.2,.3,0xc9d3bd);
        for(const x of [-.8,0,.8])box(x,1.2,-1.83,.49,1.1,.03,0xeff0df);
        box(-1.65,.47,1.2,.68,.12,.55,0xb49b70);box(-1.65,.72,1.42,.68,.46,.09,0x55715d);
        for(const x of [-1.88,-1.42])box(x,.22,1.2,.06,.4,.4,0x55715d);
        const puddle=mesh(new T.CircleGeometry(.4,48),0x99bebb,.25,.05,.75);puddle.rotation.x=-Math.PI/2;puddle.scale.set(1.5,.7,1);
        cylinder(-.23,.7,-.6,.14,.55,0xc6a678);ball(-.23,1.11,-.6,.14,0xd7b78e);
        for(const x of [-.32,-.14])box(x,.29,-.6,.1,.45,.12,0x315f50);
        box(2,.34,1.35,.65,.45,.98,0xe4be75);box(2,.65,1.35,.56,.24,.53,0x547c70);
        for(const x of [1.67,2.33])for(const z of [1.05,1.64]){const wheel=cylinder(x,.19,z,.13,.08,0x345849);wheel.rotation.z=Math.PI/2;}
      }else{
        ground.material=material(0xc8b999);
        box(-2.45,1.12,0,.14,2.5,4.05,0xcbd4bf);box(0,1.12,-1.96,5.04,2.5,.14,0xe6e4d6);
        box(-1.2,1.48,-1.86,1.45,1.18,.05,0x7d9f92);
        box(-1.2,1.48,-1.8,.035,1.24,.04,0xf5f1df);box(-1.2,1.48,-1.8,1.5,.035,.04,0xf5f1df);
        box(1.52,1,-1.84,.9,2,.08,0xab9e7e);box(1.52,1.02,-1.77,.72,1.78,.04,0xbeb297);ball(1.82,1,-1.7,.035,0x557462);
        box(-.4,.98,-.05,2.1,.15,1.24,0xb99a6f);
        for(const x of [-1.24,.44])for(const z of [-.5,.4])box(x,.45,z,.09,.9,.09,0x947e5d);
        box(.45,.57,1.05,.68,.11,.68,0x577c65);box(.45,1.02,1.39,.68,.84,.1,0x6d9377);
        for(const x of [.19,.71])for(const z of [.8,1.31])box(x,.27,z,.07,.54,.07,0x55735e);
        cylinder(-.74,1.18,-.1,.13,.25,0xf9f0dc);
        const handle=mesh(new T.TorusGeometry(.1,.025,8,20),0xf9f0dc,-.58,1.2,-.1);handle.rotation.y=Math.PI/2;
        box(-.02,1.075,-.27,.4,.035,.32,0x3d725b);
        cylinder(-1.83,.24,.95,.24,.48,0xb89e78);
        for(let i=0;i<5;i++){const leaf=ball(-1.83+Math.sin(i*2)*.18,.65+i*.13,.95+Math.cos(i*2)*.12,.2,0x729268);leaf.scale.set(.55,1.5,.55);}
        focus=target==='door'?new T.Vector3(1.45,.9,-1.5):target==='bottle'?new T.Vector3(-.7,1,-.1):new T.Vector3(.45,.6,1);
      }
      const ring=mesh(new T.TorusGeometry(kind==='outdoor'?.5:.42,.014,8,80),0xc6a65f,focus.x,.08,focus.z,floating);ring.rotation.x=-Math.PI/2;
      const marker=mesh(new T.OctahedronGeometry(.09),0xd9b568,focus.x,kind==='outdoor'?1.7:1.9,focus.z,floating);
      const poses=[[6,4.9,7],[0,3.3,9],[4,3.2,5.2]];
      const initial=poses[viewRef.current];camera.position.set(initial[0]+(reduced?0:.8),initial[1]+(reduced?0:.8),initial[2]+(reduced?0:1.3));
      const aim=new T.Vector3(0,.65,0),destination=new T.Vector3();
      const pointer={x:0,y:0},clock=new T.Clock();let frame=0,visible=true;
      const fine=matchMedia('(hover:hover) and (pointer:fine)');
      function move(e:PointerEvent){if(reduced||!fine.matches)return;const rect=element.getBoundingClientRect();pointer.x=((e.clientX-rect.left)/rect.width-.5)*.7;pointer.y=((e.clientY-rect.top)/rect.height-.5)*.4;}
      function leave(){pointer.x=pointer.y=0;}
      function draw(){const time=clock.getElapsedTime();const yaw=reduced||viewRef.current!==0?0:Math.sin(time*.4)*.12;
        world.rotation.y+=(pointer.x*.15+yaw-world.rotation.y)*.045;
        const pose=poses[viewRef.current],blend=reduced?1:.055;
        destination.set(pose[0]+(reduced?0:pointer.x),pose[1]+(reduced?0:pointer.y),pose[2]);camera.position.lerp(destination,blend);aim.lerp(viewRef.current===2?focus:new T.Vector3(0,.65,0),blend);camera.lookAt(aim);
        marker.position.y=(kind==='outdoor'?1.7:1.9)+(reduced?0:Math.sin(time*1.4)*.06);marker.rotation.y=reduced?.3:time*.4;
        renderer.render(scene,camera);
      }
      function tick(){draw();if(!reduced&&visible&&!disposed&&!document.hidden)frame=requestAnimationFrame(tick);}
      const resize=new ResizeObserver(()=>{const width=element.clientWidth,height=element.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();draw();});resize.observe(element);
      const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;cancelAnimationFrame(frame);if(visible)tick();});observer.observe(element);
      function visibility(){cancelAnimationFrame(frame);if(!document.hidden&&visible)tick();}
      element.addEventListener('pointermove',move);element.addEventListener('pointerleave',leave);document.addEventListener('visibilitychange',visibility);
      redraw.current=draw;draw();setReady(true);
      cleanup=()=>{redraw.current=()=>{};cancelAnimationFrame(frame);resize.disconnect();observer.disconnect();document.removeEventListener('visibilitychange',visibility);element.removeEventListener('pointermove',move);element.removeEventListener('pointerleave',leave);scene.traverse((object:any)=>object.geometry?.dispose());materials.forEach(value=>value.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
    }).catch(()=>{});
    return()=>{disposed=true;cleanup();};
  },[kind,target,reduced]);
  return <div className="spatial-stage" data-ready={ready} data-reduced={reduced}>
    <div className="spatial-atmosphere" aria-hidden="true"/>
    <div className="spatial-header"><span><i/>{kind==='outdoor'?'街区空间':'室内空间'}</span><span>场景示意 · 非识别结果</span></div>
    <div className="spatial-viewport" ref={host} role="img" aria-label={kind==='outdoor'?'立体街区示意，包含树木、行人、水坑和车辆':'立体房间示意，包含桌椅、杯子和房门'}>
      <img className="spatial-fallback" src={`./assets/${kind}.svg`} alt=""/>
    </div>
    <div className="spatial-footer"><div><span className="spatial-eyebrow">{kind==='outdoor'?'感知眼前，安心准备':'让寻找，更有方向'}</span><strong>{kind==='outdoor'?'下一步，从看见开始。':'熟悉的空间，新的视角。'}</strong></div><div className="spatial-views" role="group" aria-label="场景视角">{['环视','正面','聚焦'].map((label,index)=><button key={label} type="button" aria-pressed={view===index} onClick={()=>setView(index)}>{label}</button>)}</div></div>
  </div>;
}
