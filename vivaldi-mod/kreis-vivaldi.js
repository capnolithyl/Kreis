/* Kreis Vivaldi-native stack bridge. Inject only into Vivaldi's window.html.
 * The installer replaces the extension ID. No desktop pairing key is stored. */
(() => {
 'use strict';
 const UI_ID='mpognobbkildjkofajifpdfhcoklimli';
 const EXT_ID='__KREIS_EXTENSION_ID__';
 const PORT='kreis-native-stack-v1';
 if(location.protocol!=='chrome-extension:'||location.hostname!==UI_ID||
    !/\/(window|browser)\.html$/.test(location.pathname)||
    window.__KREIS_STACK_MOD__)return;
 if(!/^[a-p]{32}$/.test(EXT_ID)){console.warn('Kreis mod: invalid companion extension ID.');return;}
 window.__KREIS_STACK_MOD__=true;
 function meta(t){
   const value=t?.vivExtData;
   if(value&&typeof value==='object')return value;
   if(typeof value==='string')try{return JSON.parse(value);}catch{}
   return null;
 }
 async function readTabs(){
   const tabs=(await chrome.tabs.query({})).filter(t=>Number.isInteger(t.id)&&Number.isInteger(t.windowId));
   if(tabs.some(t=>meta(t))||typeof vivaldi==='undefined'||
      typeof vivaldi.tabsPrivate?.get!=='function')return tabs;
   return Promise.all(tabs.map(async t=>{
     try{const x=await vivaldi.tabsPrivate.get(t.id);
       if(meta(x))return {...t,vivExtData:x.vivExtData};}catch{}
     return t;
   }));
 }
 function find(tabs,name){
   const wanted=name.toLocaleLowerCase(),groups=new Set();
   for(const t of tabs){const d=meta(t);
     if(typeof d?.group==='string'&&d.group&&typeof d.fixedGroupTitle==='string'&&
        d.fixedGroupTitle.trim().toLocaleLowerCase()===wanted)groups.add(d.group);}
   const members=tabs.filter(t=>groups.has(meta(t)?.group));
   return members.find(t=>t.active)||members[0]||null;
 }
 function diagnose(tabs){
   const groups=new Set();
   let count=0;
   for(const t of tabs){const d=meta(t);if(!d)continue;count++;
     if(d.group&&d.fixedGroupTitle)groups.add(d.group);}
   return {tabCount:tabs.length,metadataCount:count,namedStackCount:groups.size,
     privateAPI:typeof vivaldi!=='undefined'&&typeof vivaldi.tabsPrivate?.get==='function'};
 }
 // Always read newly-created tab records fresh. The UI's broad query can
 // briefly return the pre-move metadata even after Vivaldi renders the stack.
 async function readCreated(ids){
   return Promise.all(ids.map(async id=>{
     let tab=await chrome.tabs.get(id);
     if(!meta(tab)?.group && typeof vivaldi!=='undefined' &&
        typeof vivaldi.tabsPrivate?.get==='function'){
       try{
         const extra=await vivaldi.tabsPrivate.get(id);
         if(meta(extra)?.group)tab={...tab,vivExtData:extra.vivExtData};
       }catch{ /* chrome.tabs.get is still usable. */ }
     }
     return tab;
   }));
 }
 async function create(name,url){
   if(url){let u;try{u=new URL(url);}catch{throw Error('Invalid stack starting URL.');}
     if(!['http:','https:'].includes(u.protocol))throw Error('Only HTTP(S) starting URLs are supported.');}
   const vApi=typeof vivaldi!=='undefined' ? vivaldi.tabsPrivate : null;
   const cApi=chrome.tabsPrivate || null;
   const sources=[['vivaldi.tabsPrivate',vApi],['chrome.tabsPrivate',cApi]];
   const provider=sources.find(([,api])=>typeof api?.move==='function' &&
     (typeof api?.setGroupProperties==='function'||typeof api?.setExtData==='function')) ||
     sources.find(([,api])=>typeof api?.move==='function');
   if(!provider)throw Error('Native Vivaldi grouping is unavailable. No tabs changed.');
   const native=provider[1];
   const w=await chrome.windows.getLastFocused({windowTypes:['normal']});
   if(!Number.isInteger(w?.id))throw Error('No normal Vivaldi window is focused.');
   const created=[];
   let groupCreated=false;
   try{
     for(const page of [url||'about:blank','about:blank']){
       const t=await chrome.tabs.create({windowId:w.id,url:page,active:false});
       if(!Number.isInteger(t?.id))throw Error('Could not open the new stack tabs.');
       created.push(t.id);
     }
     const moved=await native.move({
       tabIds:created[1],target:created[0],
       tweaks:['target-is-tab','on','create-new-group']
     });
     // A successful native move can already have grouped the tabs, even if a
     // later read or metadata write fails. Never delete that completed group.
     if(moved?.success===true)groupCreated=true;
     if(!groupCreated||typeof moved.group!=='string'||!moved.group)
       throw Error('Vivaldi did not confirm native group creation: '+String(moved?.message||'no group ID returned'));
     let members=null,groupId=moved.group;
     for(let attempt=0;attempt<10;attempt++){
       const current=await readCreated(created);
       const groups=current.map(t=>meta(t)?.group);
       if(groups[0]&&groups[0]===groups[1]){
         members=current;
         groupId=groups[0];
         break;
       }
       if(attempt<9)await new Promise(resolve=>setTimeout(resolve,200));
     }
     if(!members)throw Error('Native stack was created but its group metadata was not readable yet.');

     // setGroupProperties is used by Vivaldi UI mods to rename native groups.
     // Some builds expose it even when tabsPrivate.setExtData is missing.
     const groupApi=sources.find(([,api])=>typeof api?.setGroupProperties==='function');
     const extApi=sources.find(([,api])=>typeof api?.setExtData==='function');
     if(groupApi){
       await new Promise((resolve,reject)=>{
         let settled=false;
         const finish=error=>{if(settled)return;settled=true;
           clearTimeout(timer);error?reject(error):resolve();};
         const timer=setTimeout(()=>finish(null),1400);
         try{
           const response=groupApi[1].setGroupProperties(
             {groupExtId:groupId,groupTitle:name},
             ()=>finish(chrome.runtime.lastError?
               Error('Vivaldi rejected group renaming: '+chrome.runtime.lastError.message):null)
           );
           if(response&&typeof response.then==='function')
             response.then(()=>finish(null),finish);
         }catch(error){finish(error);}
       });
     }else if(extApi){
       await extApi[1].setExtData({extId:groupId,groupTitle:name});
     }
     // Keep fixedGroupTitle on the member tabs too: Kreis matches this field.
     // Never write metadata to tabs outside the newly created group.
     for(const tab of await readCreated(created)){
       const data=meta(tab)||{};
       if(data.fixedGroupTitle===name)continue;
       await chrome.tabs.update(tab.id,{
         vivExtData:JSON.stringify({...data,group:groupId,fixedGroupTitle:name})
       });
     }

     for(let attempt=0;attempt<10;attempt++){
       const current=await readCreated(created);
       const names=current.map(tab=>meta(tab)?.fixedGroupTitle?.trim().toLocaleLowerCase());
       const groups=current.map(tab=>meta(tab)?.group);
       if(groups[0]===groupId&&groups[1]===groupId&&
          names.includes(name.toLocaleLowerCase()))return current[0];
       if(attempt<9)await new Promise(resolve=>setTimeout(resolve,200));
     }
     throw Error('Native stack exists, but Vivaldi did not confirm its name. Rename the saved two-tab stack manually.');
   }catch(e){
     if(groupCreated){
       // Preserve a real stack and the requested starting URL. The user can
       // inspect/rename it. Only report failure; do not destroy their new work.
       throw Error(String(e).replace(/^Error:\\s*/, '')+' The two new tabs were kept.');
     }
     if(created.length)try{await chrome.tabs.remove(created);}catch{}
     throw e;
   }
 }
 async function handle(message){
   if(message.action==='diagnose')return {report:diagnose(await readTabs())};
   if(message.action!=='lookup')throw Error('Unknown Kreis native stack command.');
   const name=typeof message.name==='string'?message.name.trim():'';
   if(!name||name.length>60)throw Error('Invalid stack name.');
   const tabs=await readTabs();
   if(tabs.length&&!tabs.some(t=>meta(t)))throw Error('Native stack metadata is unavailable even inside the Vivaldi UI.');
   const found=find(tabs,name);
   if(found)return {tab:{id:found.id,windowId:found.windowId}};
   if(message.recreate!==true)return {tab:null};
   const t=await create(name,typeof message.startUrl==='string'?message.startUrl:'');
   return {tab:{id:t.id,windowId:t.windowId}};
 }
 function connect(){
   let port;
   try{port=chrome.runtime.connect(EXT_ID,{name:PORT});}
   catch(e){console.warn('Kreis UI mod connection failed',e);setTimeout(connect,5000);return;}
   port.onMessage.addListener(message=>{
     if(message?.type!=='kreis-stack-request'||typeof message.requestId!=='string')return;
     Promise.resolve().then(()=>handle(message))
       .then(data=>port.postMessage({type:'kreis-stack-response',requestId:message.requestId,ok:true,...data}))
       .catch(e=>{try{port.postMessage({type:'kreis-stack-response',requestId:message.requestId,
         ok:false,error:String(e).slice(0,250)});}catch{}});
   });
   port.onDisconnect.addListener(()=>{if(chrome.runtime.lastError)console.info('Kreis mod:',chrome.runtime.lastError.message);setTimeout(connect,5000);});
   console.info('Kreis Vivaldi native stack mod loaded.');
 }
 connect();
})();
