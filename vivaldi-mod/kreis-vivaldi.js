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
 async function create(name,url){
   if(url){let u;try{u=new URL(url);}catch{throw Error('Invalid stack starting URL.');}
     if(!['http:','https:'].includes(u.protocol))throw Error('Only HTTP(S) starting URLs are supported.');}
   // Vivaldi's native move operation creates the actual group. The normal
   // tab update API alone cannot reliably create one from scratch.
   // After native creation, a UI mod may name the group via vivExtData.
   // Private APIs differ between Vivaldi versions.
   const vApi=typeof vivaldi!=='undefined' ? vivaldi.tabsPrivate : null;
   const cApi=chrome.tabsPrivate || null;
   const sources=[['vivaldi.tabsPrivate',vApi],['chrome.tabsPrivate',cApi]];
   // A native move API is mandatory. Naming can use setExtData or, from
   // Vivaldi's privileged UI, a tab's vivExtData.fixedGroupTitle.
   const provider=sources.find(([,api])=>
     typeof api?.move==='function'&&typeof api?.setExtData==='function') ||
     sources.find(([,api])=>typeof api?.move==='function');
   const namer=sources.find(([,api])=>typeof api?.setExtData==='function');
   if(!provider || (!namer && typeof chrome.tabs?.update!=='function')){
     const summary=sources.map(([label,api])=>
       label+' [get='+ (typeof api?.get==='function'?'yes':'no')+
       ', move='+ (typeof api?.move==='function'?'yes':'no')+
       ', setExtData='+ (typeof api?.setExtData==='function'?'yes':'no')+
       ']').join('; ');
     throw Error('Native stack creation unavailable: '+summary+'. No tabs changed.');
   }
   const native=provider[1];
   const w=await chrome.windows.getLastFocused({windowTypes:['normal']});
   if(!Number.isInteger(w?.id))throw Error('No normal Vivaldi window is focused.');
   const created=[];
   try{
     // A native stack requires at least two tabs. Both belong exclusively to Kreis.
     for(const page of [url||'about:blank','about:blank']){
       const t=await chrome.tabs.create({windowId:w.id,url:page,active:false});
       if(!Number.isInteger(t?.id))throw Error('Could not create stack tabs.');
       created.push(t.id);
     }
     // Use Vivaldi's native group operation rather than writing undocumented
     // tab metadata through the regular Chromium extension API.
     const moved=await native.move({
       tabIds:created[1], target:created[0],
       tweaks:['target-is-tab','on','create-new-group']
     });
     if(moved?.success!==true||typeof moved.group!=='string'||!moved.group)
       throw Error('Vivaldi refused to create a native stack: '+String(moved?.message||'no group ID returned'));
     // Do not attempt to name the group until native membership is visible.
     // All tab writes below are restricted to the two IDs Kreis just created.
     let members=null;
     for(let attempt=0;attempt<8;attempt++){
       const tabs=await readTabs();
       const current=created.map(id=>tabs.find(t=>t.id===id));
       if(current.every(t=>t&&meta(t)?.group===moved.group)){
         members=current;
         break;
       }
       if(attempt<7)await new Promise(resolve=>setTimeout(resolve,200));
     }
     if(!members)throw Error('Vivaldi returned a group ID but did not confirm native membership.');
     if(namer){
       await namer[1].setExtData({extId:moved.group,groupTitle:name});
     }else{
       // UI mods can update named-stack metadata, even though an ordinary
       // MV3 extension cannot. Preserve Vivaldi's existing group and fields.
       for(const tab of members){
         await chrome.tabs.update(tab.id,{
           vivExtData:JSON.stringify({...meta(tab),fixedGroupTitle:name})
         });
       }
     }

     // Verify persistent naming using a fresh native metadata read.
     // An ignored vivExtData update is a failure, not a successful launch.
     for(let attempt=0;attempt<8;attempt++){
       const tabs=await readTabs();
       const current=created.map(id=>tabs.find(t=>t.id===id));
       if(current.every(t=>t&&meta(t)?.group===moved.group)&&
          current.some(t=>meta(t)?.fixedGroupTitle?.trim().toLocaleLowerCase()===
            name.toLocaleLowerCase()))return current[0];
       if(attempt<7)await new Promise(resolve=>setTimeout(resolve,200));
     }
     throw Error('Vivaldi created a native group but did not preserve its requested name.');
   }catch(e){
     // Never modify or remove an existing tab. Roll back only what we created.
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
