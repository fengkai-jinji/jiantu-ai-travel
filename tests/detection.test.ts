import { test } from 'node:test';
import assert from 'node:assert/strict';
import { targetObjects, describe, Generation } from '../src/detection.ts';
test('只描述指定目标，并保留瓶杯合并口径', () => {
  const objects = [{class_id:0,name:'bottle',label:'杯子',confidence:.8,xyxy:[0,0,10,10],side:'左侧'}, {class_id:1,name:'chair',label:'椅子',confidence:.7,xyxy:[1,1,20,20],side:'右侧'}];
  assert.equal(targetObjects(objects,'chair').length,1);
  assert.match(describe(objects,'bottle'),/瓶／杯/);
  assert.match(describe(objects,'door'),/未检出/);
});
test('停止或新请求使旧结果失效', () => {
  const generation = new Generation(); const old=generation.next();
  assert.equal(generation.current(old),true); generation.next();
  assert.equal(generation.current(old),false);
});
