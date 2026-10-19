import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tabData,namedStack,lookupStack,inspectVivaldiTabs } from './vivaldi-stack.js';
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

test('metadata may be exposed only by populated windows, not tabs.query',async()=>{
  const raw={group:'g1',fixedGroupTitle:'Runagaldr'};
  const api={
    tabs:{query:async()=>[{id:1,windowId:2,url:'https://example.org'}]},
    windows:{getAll:async()=>[{tabs:[{id:1,windowId:2,vivExtData:JSON.stringify(raw)}]}]}
  };
  const {tabs,diagnostic}=await inspectVivaldiTabs(api);
  assert.equal(diagnostic.queryData,0);
  assert.equal(diagnostic.windowData,1);
  assert.equal(diagnostic.metadataAccessible,true);
  assert.equal(namedStack(tabs,'Runagaldr').id,1);
});
test('metadata may be exposed only by individual tabs.get calls',async()=>{
  const api={
    tabs:{query:async()=>[{id:1,windowId:2}],get:async id=>({id,windowId:2,vivExtData:'{"group":"x","fixedGroupTitle":"Kreis"}'})},
    windows:{getAll:async()=>[]}
  };
  const {tabs,diagnostic}=await inspectVivaldiTabs(api);
  assert.equal(diagnostic.fetchedData,1);
  assert.equal(namedStack(tabs,'Kreis').id,1);
});
test('diagnostics never expose tab URLs, titles, or identifiers',async()=>{
  const api={tabs:{query:async()=>[{id:99,windowId:2,url:'https://private.invalid/path',title:'Secret'}]}};
  const {diagnostic}=await inspectVivaldiTabs(api);
  const output=JSON.stringify(diagnostic);
  assert.equal(output.includes('private.invalid'),false);
  assert.equal(output.includes('Secret'),false);
  assert.equal(output.includes('"id":99'),false);
});
