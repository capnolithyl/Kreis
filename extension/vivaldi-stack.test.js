import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tabData,namedStack,lookupStack } from './vivaldi-stack.js';
const tab=(id,group,title,active=false)=>({id,windowId:7,active,vivExtData:JSON.stringify({group,fixedGroupTitle:title})});
test('matches exact named native stacks and prefers active members',()=>{
  assert.equal(namedStack([tab(1,'a','Kreis'),tab(2,'a','',true),tab(3,'b','Runagaldr')],' kreis ').id,2);
  assert.equal(namedStack([tab(1,'a','Kreis')],'Kreis 2'),null);
  assert.equal(tabData({vivExtData:'{broken'}),null);
});
test('without recreation a missing stack does not modify anything',async()=>{
  assert.deepEqual(await lookupStack({tabs:{query:async()=>[tab(1,'a','Other')]}},'Kreis',false),[]);
});
test('when the extension cannot see proprietary metadata we do not create tabs',async()=>{
  let touched=false;const api={tabs:{query:async()=>[{id:1}],create:async()=>{touched=true;}}};
  await assert.rejects(()=>lookupStack(api,'Kreis',true),/unavailable/);
  assert.equal(touched,false);
});
test('creation uses new tabs and verifies the stack name and ID',async()=>{
  let next=10;const saved=new Map();
  const api={tabs:{
    query:async()=>[tab(1,'a','Other')],
    create:async()=>{const t={id:next++,windowId:7,vivExtData:'{}'};saved.set(t.id,t);return t;},
    get:async(id)=>saved.get(id),
    update:async(id,props)=>{saved.get(id).vivExtData=props.vivExtData},
    remove:async()=>{throw Error('Should not remove on success')}
  },windows:{getLastFocused:async()=>({id:7})}};
  assert.equal((await lookupStack(api,'Kreis',true,'https://example.com')).length,1);
  assert.equal(tabData(saved.get(10)).group,tabData(saved.get(11)).group);
  assert.equal(tabData(saved.get(11)).fixedGroupTitle,'Kreis');
});
test('failed writes remove only the two tabs Kreis created',async()=>{
  let next=10;const removed=[];
  const api={tabs:{
    query:async()=>[tab(1,'a','Other')],
    create:async()=>({id:next++}),
    get:async(id)=>({id,windowId:7,vivExtData:'{}'}),
    update:async()=>{},
    remove:async ids=>removed.push(ids)
  },windows:{getLastFocused:async()=>({id:7})}};
  await assert.rejects(()=>lookupStack(api,'Kreis',true),/ignored native stack metadata/);
  assert.deepEqual(removed,[[10,11]]);
});
