/** Broker between privileged Vivaldi UI mod and ordinary Kreis extension.
 * The native mod connects using Chromium's cross-extension Port API.
 * No pairing token, URL, or tab title crosses the UI-mod boundary. */
export const UI_ID='mpognobbkildjkofajifpdfhcoklimli';
export const PORT_NAME='kreis-native-stack-v1';

export class NativeStackBroker {
  constructor(timeout=10000){this.ports=new Set();this.pending=new Map();this.timeout=timeout;this.onContextAdd=null;}
  get connected(){return this.ports.size>0;}
  attach(port){
    if(port?.name!==PORT_NAME || port.sender?.id!==UI_ID ||
       !port.sender?.url?.startsWith('chrome-extension://'+UI_ID+'/')){
      try{port?.disconnect();}catch{}
      return false;
    }
    this.ports.add(port);
    port.onMessage.addListener(message=>this.receive(port,message));
    port.onDisconnect.addListener(()=>{
      this.ports.delete(port);
      for(const [id,p] of this.pending)if(p.port===port){
        clearTimeout(p.timer);this.pending.delete(id);
        p.reject(Error('Vivaldi UI mod disconnected. Restart Vivaldi.'));
      }
    });
    return true;
  }
  receive(port,message){
    if(!this.ports.has(port))return;
    if(message?.type==='kreis-stack-context-add'){
      const name=message.name;
      if(typeof name==='string'&&name.trim()&&name.trim().length<=60&&
        !/[\x00-\x1f\x7f]/.test(name)&&typeof this.onContextAdd==='function'){
        this.onContextAdd(name.trim());
      }
      return;
    }
    if(message?.type!=='kreis-stack-response'||typeof message.requestId!=='string')return;
    const p=this.pending.get(message.requestId);
    if(!p||p.port!==port)return;
    clearTimeout(p.timer);this.pending.delete(message.requestId);
    if(message.ok!==true)return p.reject(Error(String(message.error||'Native Vivaldi stack lookup failed.').slice(0,280)));
    if(p.action==='resolve-tab'){
      const name=message.stackName;
      if(typeof name!=='string'||!name.trim()||name.trim().length>60||
        /[\x00-\x1f\x7f]/.test(name))
        return p.reject(Error('This tab is not inside a named Vivaldi Tab Stack.'));
      return p.resolve(name.trim());
    }
    if(p.action==='diagnose'){
      const r=message.report;
      if(!r||typeof r!=='object')return p.reject(Error('Invalid mod diagnostics.'));
      return p.resolve({
        tabCount:Math.max(0,Math.min(50000,Number(r.tabCount)||0)),
        metadataCount:Math.max(0,Math.min(50000,Number(r.metadataCount)||0)),
        namedStackCount:Math.max(0,Math.min(50000,Number(r.namedStackCount)||0)),
        privateAPI:r.privateAPI===true
      });
    }
    if(message.tab===null)return p.resolve([]);
    const t=message.tab;
    if(!t||!Number.isInteger(t.id)||t.id<0||!Number.isInteger(t.windowId)||t.windowId<0)
      return p.reject(Error('Invalid tab returned by Vivaldi UI mod.'));
    p.resolve([{id:t.id,windowId:t.windowId,title:p.name}]);
  }
  request(action,fields={}){
    const port=[...this.ports][0];
    if(!port)return Promise.reject(Error('Vivaldi UI mod is not connected. Install the optional Vivaldi mod and restart Vivaldi.'));
    const id=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        this.pending.delete(id);reject(Error('Vivaldi UI mod timed out.'));
      },this.timeout);
      this.pending.set(id,{port,timer,resolve,reject,action,name:fields.name||''});
      try{port.postMessage({type:'kreis-stack-request',requestId:id,action,...fields});}
      catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}
    });
  }
  lookup(name,recreate=false,startUrl=''){
    if(typeof name!=='string'||!name.trim()||name.length>60)
      return Promise.reject(Error('Enter a stack name (up to 60 characters).'));
    if(startUrl){try{const u=new URL(startUrl);if(!['http:','https:'].includes(u.protocol))throw Error();}
      catch{return Promise.reject(Error('Starting URL must be HTTP(S).'));}}
    return this.request('lookup',{name:name.trim(),recreate:recreate===true,startUrl});
  }
  resolveTab(tabId){
    if(!Number.isInteger(tabId)||tabId<0)return Promise.reject(Error('Invalid Vivaldi tab ID.'));
    return this.request('resolve-tab',{tabId});
  }
  diagnose(){return this.request('diagnose');}
}
