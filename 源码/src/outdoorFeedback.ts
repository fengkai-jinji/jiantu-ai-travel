export type Level='危险'|'近'|'中';
export interface FeedbackObject{name:string;label:string;direction:string;level:Level;off_route:boolean}
export interface Observation<T>{object:T;confirmed:boolean;streak:number}
const keyOf=(object:FeedbackObject)=>`${object.name}|${object.direction}`;
const priority:Record<Level,number>={'危险':0,'近':1,'中':2};
const cooldown:Record<Level,number>={'危险':2000,'近':4000,'中':6000};

// 相邻采样帧中同类别、同方位的证据，不代表同一实体的轨迹跟踪。
export class FrameConfirmation{
  private previous=new Set<string>();
  update<T extends FeedbackObject>(objects:T[],live:boolean):Observation<T>[] {
    const observations=objects.map(object=>({object,confirmed:!live||this.previous.has(keyOf(object)),streak:live?(this.previous.has(keyOf(object))?2:1):0}));
    this.previous=live?new Set(objects.map(keyOf)):new Set();
    return observations;
  }
  reset(){this.previous.clear();}
}
export class OutdoorSpeech{
  private spoken=new Map<string,number>();
  private dangers=new Set<string>();
  plan(objects:FeedbackObject[],live:boolean,now:number,busy:boolean,enabled=true){
    if(!enabled){this.reset();return {text:'',interrupt:false};}
    const nextDangers=new Set(objects.filter(o=>o.level==='危险').map(keyOf));
    const freshDangers=new Set([...nextDangers].filter(key=>!this.dangers.has(key)));
    this.dangers=nextDangers;
    const unique=new Map<string,FeedbackObject>();
    for(const object of [...objects].sort((a,b)=>priority[a.level]-priority[b.level])){
      const key=keyOf(object);
      if(object.level!=='中'&&!unique.has(key))unique.set(key,object);
    }
    const audible=[...unique.values()].filter(object=>{
      const key=keyOf(object),fresh=object.level==='危险'&&freshDangers.has(key);
      if(busy&&!fresh)return false;
      const last=this.spoken.get(`${key}|${object.level}`);
      return !live||fresh||last===undefined||now-last>=cooldown[object.level];
    });
    for(const object of audible)this.spoken.set(`${keyOf(object)}|${object.level}`,now);
    return {
      text:audible.map(object=>object.level==='危险'?`危险提示，${object.direction}有${object.label}，请停下观察`:object.name==='puddle'?`${object.direction}有水坑，小心脚下`:`${object.direction}有${object.label}，请留意`).join('。'),
      interrupt:audible.some(object=>object.level==='危险'&&freshDangers.has(keyOf(object))),
    };
  }
  reset(){this.spoken.clear();this.dangers.clear();}
}
