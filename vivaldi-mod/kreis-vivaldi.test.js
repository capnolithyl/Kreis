import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

const id='abcdefghijklmnopabcdefghijklmnop';
const source=readFileSync(new URL('./kreis-vivaldi.js',import.meta.url),'utf8')
  .replace('__KREIS_EXTENSION_ID__',id);
const tab=(id,group,name,active=false)=>({
  id,windowId:7,active,vivExtData:JSON.stringify({group,fixedGroupTitle:name})
});

function environment(tabs,overrides={}) {
  let handler, nextId=50;
  const created=[],removed=[],updated=[],sent=[];
  const port={
    onMessage:{addListener(cb){handler=cb}},
    onDisconnect:{addListener(){}},
    postMessage(value){sent.push(value)}
  };
  const api={
    runtime:{connect:(extensionId, options)=>{
      assert.equal(extensionId,id);
      assert.equal(options.name,'kreis-native-stack-v1');
      return port;
    },lastError:null},
    tabs:{
      async query(){return tabs;},
      async get(id){return tabs.find(t=>t.id===id);},
      async create({windowId,url,active}){
        const t={id:nextId++,windowId,url,active,vivExtData:'{}'};
        tabs.push(t);created.push(t.id);return t;
      },
      async update(id,values){
        updated.push({id,values});
        const t=tabs.find(t=>t.id===id);
        if(values.vivExtData)t.vivExtData=values.vivExtData;
        return t;
      },
      async remove(ids){removed.push(...ids);for(const id of ids){
        const index=tabs.findIndex(t=>t.id===id);if(index!==-1)tabs.splice(index,1);
      }}
    },
    windows:{async getLastFocused(){return {id:7}}}
  };
  const window={};
  runInNewContext(source,{
    location:{protocol:'chrome-extension:',hostname:'mpognobbkildjkofajifpdfhcoklimli',
      pathname:'/window.html'},window,chrome:api,crypto:webcrypto,setTimeout,
    console:{info(){},warn(){}},...overrides
  });
  async function request(action,extra={}){
    const requestId='test'+(sent.length+1);
    handler({type:'kreis-stack-request',requestId,action,...extra});
    for(let i=0;i<20;i++){
      await new Promise(resolve=>setImmediate(resolve));
      const result=sent.find(m=>m.requestId===requestId);
      if(result)return result;
    }
    throw Error('No native mod response');
  }
  return {request,created,removed,updated,tabs,window};
}
test('finds a stack by name without examining URLs',async()=>{
  const ctx=environment([tab(1,'a','Kreis'),tab(2,'a','Kreis',true),tab(3,'b','Other')]);
  const r=await ctx.request('lookup',{name:'kreis',recreate:false});
  assert.equal(r.ok,true);
  assert.equal(r.tab.id,2);
  assert.equal(ctx.updated.length,0);
});
test('recognizes native metadata available only through Vivaldi private API',async()=>{
  const item={id:8,windowId:7,active:true};
  const ctx=environment([item],{vivaldi:{tabsPrivate:{
    get:async()=>({vivExtData:'{"group":"a","fixedGroupTitle":"Runagaldr"}'})
  }}});
  const r=await ctx.request('lookup',{name:'Runagaldr'});
  assert.equal(r.ok,true);
  assert.equal(r.tab.id,8);
});
test('diagnostics contain counts, never browsing history',async()=>{
  const ctx=environment([tab(1,'a','Kreis'),{id:2,windowId:7,url:'https://secret.invalid'}]);
  const r=await ctx.request('diagnose');
  assert.equal(r.ok,true);assert.equal(r.report.tabCount,2);
  assert.equal(JSON.stringify(r).includes('secret.invalid'),false);
});
test('a missing stack does not create tabs unless explicitly requested',async()=>{
  const ctx=environment([tab(1,'a','Kreis')]);
  const r=await ctx.request('lookup',{name:'Not there',recreate:false});
  assert.equal(r.ok,true);assert.equal(r.tab,null);
  assert.deepEqual(ctx.created,[]);
});
test('recreation uses only new tabs and preserves existing stack membership',async()=>{
  const original=tab(1,'a','Kreis');
  const ctx=environment([original]);
  const r=await ctx.request('lookup',{name:'Runagaldr',recreate:true,
    startUrl:'https://runagaldr.com'});
  assert.equal(r.ok,true);
  assert.equal(ctx.created.length,2);
  assert.equal(ctx.removed.length,0);
  assert.equal(ctx.updated.length,2);
  assert.equal(original.vivExtData,'{"group":"a","fixedGroupTitle":"Kreis"}');
});
