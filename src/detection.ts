export type Target = 'bottle' | 'chair' | 'door';
export interface Detection {class_id:number;name:string;label:string;confidence:number;xyxy:number[];side:string}
export interface Result {objects:Detection[];image:string;width:number;height:number;inference_ms:number;device:string}
export const names:Record<Target,string>={bottle:'瓶／杯',chair:'椅子',door:'门'};
export const targetObjects=(objects:Detection[],target:Target)=>objects.filter(o=>o.name===target);
export function describe(objects:Detection[],target:Target){
  const found=targetObjects(objects,target);
  return found.length ? `检测到${found.length}个${names[target]}，位于${[...new Set(found.map(o=>o.side))].join('、')}。` : `当前画面未检出${names[target]}，可以重新取景。`;
}
export class Generation {
  private value=0;
  next(){return ++this.value;}
  current(value:number){return this.value===value;}
}
export async function detect(blob:Blob,signal:AbortSignal):Promise<Result>{
  const response=await fetch('/api/image?conf=0.35&mode=project',{method:'POST',body:blob,signal});
  if(!response.ok){let message='识别服务不可用，请先启动本地 YOLO 服务。';try{message=(await response.json()).error||message;}catch{}throw new Error(message);}
  return response.json();
}
