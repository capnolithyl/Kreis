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
  const created=[],removed=[],updated=[],sent=[],moved=[],named=[];
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
  // Simulate Vivaldi's proprietary grouping API. Real Chromium chrome.tabs.update
  // does not promise to write native vivExtData; native.move does the grouping.
  const native = {
    async get(id){ return tabs.find(t=>t.id===id); },
    async move(details){
      moved.push(details);
      assert.equal(details.tabIds,created[1]);
      assert.equal(details.target,created[0]);
      const group='new-vivaldi-group';
      for(const tabId of created){
        const t=tabs.find(t=>t.id===tabId);
        t.vivExtData=JSON.stringify({...JSON.parse(t.vivExtData||'{}'),group});
      }
      return {success:true,group};
    },
    async setExtData({extId,groupTitle}){
      named.push({extId,groupTitle});
      for(const id of created){
        const t=tabs.find(t=>t.id===id);
        t.vivExtData=JSON.stringify({...JSON.parse(t.vivExtData),fixedGroupTitle:groupTitle});
      }
    }
  };
  if(overrides.enableChromeNamespace===true)api.tabsPrivate=native;
  const window={};
  runInNewContext(source,{
    location:{protocol:'chrome-extension:',hostname:'mpognobbkildjkofajifpdfhcoklimli',
      pathname:'/window.html'},window,chrome:api,crypto:webcrypto,URL,setTimeout,
    console:{info(){},warn(){}},vivaldi:{tabsPrivate:native},...overrides
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
  return {request,created,removed,updated,moved,named,tabs,window};
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
  assert.equal(ctx.updated.length,0);
  assert.equal(ctx.moved.length,1);
  assert.equal(ctx.moved[0].tweaks.join(','),'target-is-tab,on,create-new-group');
  assert.equal(ctx.named.length,1);
  assert.equal(ctx.named[0].groupTitle,'Runagaldr');
  assert.equal(original.vivExtData,'{"group":"a","fixedGroupTitle":"Kreis"}');
});

test('refused native grouping closes only Kreis-created tabs',async()=>{
  const original=tab(1,'original','Important');
  const ctx=environment([original],{vivaldi:{tabsPrivate:{
    move:async()=>({success:false,message:'Could not group tabs'}),
    setExtData:async()=>{throw Error('Should never try naming after failure');}
  }}});
  const r=await ctx.request('lookup',{name:'Runagaldr',recreate:true});
  assert.equal(r.ok,false);
  assert.match(r.error,/refused to create a native stack/i);
  assert.equal(ctx.created.length,2);
  assert.equal(ctx.removed.length,2);
  assert.equal(ctx.updated.length,0);
  assert.equal(ctx.tabs.length,1);
  assert.equal(ctx.tabs[0],original);
});

test('missing private creation methods do not even open temporary tabs',async()=>{
  const ctx=environment([tab(1,'group','Kreis')],{
    vivaldi:{tabsPrivate:{get:async()=>({})}}
  });
  const r=await ctx.request('lookup',{name:'Runagaldr',recreate:true});
  assert.equal(r.ok,false);
  assert.match(r.error,/Native stack creation unavailable/);
  assert.match(r.error,/vivaldi\.tabsPrivate \[get=yes, move=no, setExtData=no\]/);
  assert.match(r.error,/chrome\.tabsPrivate \[get=no, move=no, setExtData=no\]/);
  assert.equal(ctx.created.length,0);
  assert.equal(ctx.removed.length,0);
});

test('native naming failures roll back only the created tabs',async()=>{
  const original=tab(1,'safe','Kreis');
  const ctx=environment([original],{vivaldi:{tabsPrivate:{
    async move(){
      const group='new-vivaldi-group';
      return {success:true,group};
    },
    async setExtData(){throw Error('Cannot name native group');}
  }}});
  const r=await ctx.request('lookup',{name:'Runagaldr',recreate:true});
  assert.equal(r.ok,false);
  assert.match(r.error,/Cannot name native group/);
  assert.equal(ctx.removed.length,2);
  assert.equal(ctx.tabs.length,1);
  assert.equal(ctx.tabs[0],original);
});


test('falls back to the Chromium private namespace when Vivaldi UI lacks creation functions',async()=>{
  const original=tab(1,'original','Kreis');
  const ctx=environment([original],{
    enableChromeNamespace:true,
    vivaldi:{tabsPrivate:{get:async()=>({})}}
  });
  const r=await ctx.request('lookup',{name:'Runagaldr',recreate:true,startUrl:'https://runagaldr.com'});
  assert.equal(r.ok,true);
  assert.equal(ctx.created.length,2);
  assert.equal(ctx.moved.length,1);
  assert.equal(ctx.named[0].groupTitle,'Runagaldr');
  assert.equal(ctx.tabs[0],original);
});

test('capability errors identify a missing naming method before creating anything',async()=>{
  const ctx=environment([tab(1,'a','Kreis')],{
    vivaldi:{tabsPrivate:{get:async()=>({}),move:async()=>({success:true,group:'new'})}}
  });
  const r=await ctx.request('lookup',{name:'Runagaldr',recreate:true});
  assert.equal(r.ok,false);
  assert.match(r.error,/vivaldi\.tabsPrivate \[get=yes, move=yes, setExtData=no\]/);
  assert.equal(ctx.created.length,0);
});
