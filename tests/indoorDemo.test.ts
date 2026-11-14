import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('无摄像头演示入口保留室内路由并设置演示参数',()=>{
  const source=ts.createSourceFile('Vision.tsx',readFileSync(new URL('../src/Vision.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let handler:ts.Expression|undefined;
  function visit(node:ts.Node){
    if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(source)==='button'&&node.children.some(child=>ts.isJsxText(child)&&child.text.includes('无摄像头演示'))){
      const attribute=node.openingElement.attributes.properties.find(property=>ts.isJsxAttribute(property)&&property.name.getText(source)==='onClick');
      if(attribute&&ts.isJsxAttribute(attribute)&&attribute.initializer&&ts.isJsxExpression(attribute.initializer))handler=attribute.initializer.expression;
    }
    ts.forEachChild(node,visit);
  }
  visit(source);
  assert.ok(handler,'演示按钮应有点击处理器');
  const location=new URL('http://127.0.0.1:5173/?keep=1#indoor');
  const context=vm.createContext({location,URL});
  vm.runInContext(`(${handler.getText(source)})()`,context);
  assert.equal(location.hash,'#indoor');
  assert.equal(location.searchParams.get('demo'),'1');
  assert.equal(location.searchParams.get('keep'),'1');
});
