import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FrameConfirmation,OutdoorSpeech} from '../src/outdoorFeedback.ts';
const vehicle={name:'vehicle',label:'车辆',direction:'左前方',level:'近' as const,off_route:true};
const danger={...vehicle,level:'危险' as const};

test('实时按类别和方位连续两帧确认，单帧多个同类框不能替代第二帧',()=>{
  const tracker=new FrameConfirmation();
  const first=tracker.update([vehicle,{...vehicle}],true);
  assert.deepEqual(first.map(o=>o.confirmed),[false,false]);
  assert.equal(first[0].object,vehicle);
  assert.equal(tracker.update([{...vehicle,level:'危险'}],true)[0].confirmed,true);
});
test('目标中断或变向重新确认，照片不延用实时证据',()=>{
  const tracker=new FrameConfirmation();
  tracker.update([vehicle],true);tracker.update([],true);
  assert.equal(tracker.update([vehicle],true)[0].confirmed,false);
  assert.equal(tracker.update([{...vehicle,direction:'右前方'}],true)[0].confirmed,false);
  assert.equal(tracker.update([vehicle],false)[0].confirmed,true);
  assert.equal(tracker.update([vehicle],true)[0].confirmed,false);
  tracker.reset();assert.equal(tracker.update([vehicle],true)[0].confirmed,false);
});
test('画面边缘近级车辆仍有语音提醒，中级只显示',()=>{
  const speech=new OutdoorSpeech();
  assert.match(speech.plan([vehicle],true,0,false).text,/车辆/);
  assert.equal(speech.plan([{...vehicle,level:'中'}],true,10000,false).text,'');
});
test('同危险在播报期间即使冷却已过也不重启，新危险才抢占',()=>{
  const speech=new OutdoorSpeech();
  assert.equal(speech.plan([danger],true,0,false).interrupt,true);
  const same=speech.plan([danger],true,3000,true);
  assert.equal(same.text,'');assert.equal(same.interrupt,false);
  const next=speech.plan([danger,{...danger,name:'person',label:'行人'}],true,3100,true);
  assert.match(next.text,/行人/);assert.doesNotMatch(next.text,/车辆/);assert.equal(next.interrupt,true);
});
test('语音忙时不堆积近级提示，空闲后遵循冷却，关闭自动播报清空状态',()=>{
  const speech=new OutdoorSpeech();
  assert.equal(speech.plan([vehicle],true,0,true).text,'');
  assert.match(speech.plan([vehicle],true,10,false).text,/车辆/);
  assert.equal(speech.plan([vehicle],true,1000,false).text,'');
  assert.match(speech.plan([vehicle],true,5000,false).text,/车辆/);
  assert.equal(speech.plan([danger],true,5100,true,false).text,'');
  assert.equal(speech.plan([danger],true,5200,false).interrupt,true);
});
