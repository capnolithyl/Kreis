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
  const created=[],removed=[],updated=[],sent=[],moved=[],named=[],groupProps=[];
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
        if(values.vivExtData && !overrides.ignoreVivExtDataWrites)
          t.vivExtData=values.vivExtData;
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
      if(overrides.failNativeNaming)throw Error('Cannot name native group');
      named.push({extId,groupTitle});
      for(const id of created){
        const t=tabs.find(t=>t.id===id);
        t.vivExtData=JSON.stringify({...JSON.parse(t.vivExtData),fixedGroupTitle:groupTitle});
      }
    }
  };
  if(overrides.enableSetGroupProperties===true){
    native.setGroupProperties=(properties,callback)=>{
      groupProps.push(properties);
      if(!overrides.failGroupProperties)for(const id of created){
        const t=tabs.find(t=>t.id===id);
        t.vivExtData=JSON.stringify({...JSON.parse(t.vivExtData||'{}'),
          fixedGroupTitle:properties.groupTitle});
      }
      callback?.();
    };
  }
  if(overrides.omitSetExtData===true)delete native.setExtData;
  if(overrides.enableChromeNamespace===true)api.tabsPrivate=native;
  const window={};
  runInNewContext(source,{
    location:{protocol:'chrome-extension:',hostname:'mpognobbkildjkofajifpdfhcoklimli',
      pathname:'/window.html'},window,chrome:api,crypto:webcrypto,URL,setTimeout,clearTimeout,
    console:{info(){},warn(){}},vivaldi:{tabsPrivate:native},...overrides
  });
  async function request(action,extra={}){
    const requestId='test'+(sent.length+1);
    handler({type:'kreis-stack-request',requestId,action,...extra});
    // The mod intentionally waits for Vivaldi's asynchronous group metadata.
    // A 20-tick immediate loop exits before the timeout-and-rollback path runs.
    for(let i=0;i<150;i++){
      await new Promise(resolve=>setTimeout(resolve,20));
      const result=sent.find(m=>m.requestId===requestId);
      if(result)return result;
    }
    throw Error('No native mod response');
  }
  return {request,created,removed,updated,moved,named,groupProps,tabs,window};
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
  assert.match(r.error,/did not confirm native group creation/i);
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
  assert.match(r.error,/Native Vivaldi grouping is unavailable/);
  assert.match(r.error,/No tabs changed/);
  assert.equal(ctx.created.length,0);
  assert.equal(ctx.removed.length,0);
});

test('native naming failures roll back only the created tabs',async()=>{
  const original=tab(1,'safe','Kreis');
  const ctx=environment([original],{failNativeNaming:true});
  const r=await ctx.request('lookup',{name:'Runagaldr',recreate:true});
  assert.equal(r.ok,false);
  assert.match(r.error,/Cannot name native group/);
  assert.match(r.error,/two new tabs were kept/);
  assert.equal(ctx.removed.length,0);
  assert.equal(ctx.tabs.length,3);
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

test('move-only Vivaldi UI can name an already-created group via vivExtData',async()=>{
  const original=tab(1,'safe-group','Existing');
  const ctx=environment([original],{omitSetExtData:true});
  const r=await ctx.request('lookup',{
    name:'Runagaldr',recreate:true,startUrl:'https://runagaldr.com'
  });
  assert.equal(r.ok,true);
  assert.equal(ctx.created.length,2);
  assert.equal(ctx.removed.length,0);
  assert.equal(ctx.moved.length,1);
  assert.equal(ctx.named.length,0);
  assert.equal(ctx.updated.length,2);
  for(const {id,values} of ctx.updated){
    assert.ok(ctx.created.includes(id));
    const data=JSON.parse(values.vivExtData);
    assert.equal(data.group,'new-vivaldi-group');
    assert.equal(data.fixedGroupTitle,'Runagaldr');
  }
  assert.equal(original.vivExtData,'{"group":"safe-group","fixedGroupTitle":"Existing"}');
});

test('silent naming failures remove only new tabs, keeping old groups intact',async()=>{
  const original=tab(1,'safe-group','Important');
  const ctx=environment([original],{omitSetExtData:true,ignoreVivExtDataWrites:true});
  const r=await ctx.request('lookup',{name:'Runagaldr',recreate:true});
  assert.equal(r.ok,false);
  assert.match(r.error,/did not confirm its name/);
  assert.match(r.error,/two new tabs were kept/);
  assert.equal(ctx.created.length,2);
  assert.equal(ctx.removed.length,0);
  assert.equal(ctx.tabs.length,3);
  assert.equal(ctx.tabs[0],original);
});

test('a missing native move API never opens temporary tabs',async()=>{
  const ctx=environment([tab(1,'a','Kreis')],{
    vivaldi:{tabsPrivate:{get:async()=>({}),setExtData:async()=>{}}}
  });
  const r=await ctx.request('lookup',{name:'Runagaldr',recreate:true});
  assert.equal(r.ok,false);
  assert.match(r.error,/Native Vivaldi grouping is unavailable/);
  assert.equal(ctx.created.length,0);
});

test('native setGroupProperties names group without setExtData',async()=>{
  const ctx=environment([tab(1,'safe','Kreis')],{
    omitSetExtData:true,enableSetGroupProperties:true,ignoreVivExtDataWrites:true
  });
  const r=await ctx.request('lookup',{name:'Runagaldr',recreate:true,startUrl:'https://runagaldr.com'});
  assert.equal(r.ok,true);
  assert.equal(ctx.groupProps.length,1);
  assert.equal(ctx.groupProps[0].groupExtId,'new-vivaldi-group');
  assert.equal(ctx.groupProps[0].groupTitle,'Runagaldr');
  assert.equal(ctx.removed.length,0);
  assert.equal(ctx.tabs.length,3);
});

test('group created but unreadable metadata does not delete new tabs',async()=>{
  const ctx=environment([tab(1,'safe','Kreis')],{
    vivaldi:{tabsPrivate:{
      async move(){return {success:true,group:'new-vivaldi-group'};},
      async get(){return {};}
    }}
  });
  const r=await ctx.request('lookup',{name:'Runagaldr',recreate:true});
  assert.equal(r.ok,false);
  assert.match(r.error,/group metadata was not readable/);
  assert.match(r.error,/two new tabs were kept/);
  assert.equal(ctx.removed.length,0);
  assert.equal(ctx.tabs.length,3);
});

test('native tab context resolves the clicked stack, not the active tab',async()=>{
  const ctx=environment([
    tab(1,'group-a','Kreis',true),
    tab(2,'group-b','Runagaldr'),
    tab(3,'group-b','Runagaldr')
  ]);
  const r=await ctx.request('resolve-tab',{tabId:3});
  assert.equal(r.ok,true);
  assert.equal(r.stackName,'Runagaldr');
  assert.deepEqual(ctx.created,[]);
});
test('unnamed or ungrouped tabs cannot create stack shortcuts',async()=>{
  const ctx=environment([{id:1,windowId:7,active:true},
    {id:2,windowId:7,vivExtData:JSON.stringify({group:'untitled'})}]);
  const a=await ctx.request('resolve-tab',{tabId:1});
  const b=await ctx.request('resolve-tab',{tabId:2});
  assert.equal(a.stackName,null);
  assert.equal(b.stackName,null);
});
