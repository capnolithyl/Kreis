import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NativeStackBroker,UI_ID,PORT_NAME} from './native-stack-broker.js';
const make=(id=UI_ID)=>{
  const listeners={message:[],disconnect:[]},sent=[];
  return {name:PORT_NAME,sender:{id,url:'chrome-extension://'+id+'/window.html'},
    sent,disconnected:false,postMessage(x){sent.push(x);},disconnect(){this.disconnected=true;},
    onMessage:{addListener(f){listeners.message.push(f)}},onDisconnect:{addListener(f){listeners.disconnect.push(f)}},
    reply(x){listeners.message.forEach(f=>f(x))},close(){listeners.disconnect.forEach(f=>f())}};
};
test('untrusted extension cannot attach to native Vivaldi bridge',()=>{
 const b=new NativeStackBroker(),p=make('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
 assert.equal(b.attach(p),false);assert.equal(p.disconnected,true);
});
test('stack IDs are delivered without URLs or private tab metadata',async()=>{
 const b=new NativeStackBroker(),p=make();b.attach(p);
 const promise=b.lookup('Runagaldr',false,'');
 p.reply({type:'kreis-stack-response',requestId:p.sent[0].requestId,ok:true,
   tab:{id:42,windowId:7,url:'https://private.invalid'}});
 assert.deepEqual(await promise,[{id:42,windowId:7,title:'Runagaldr'}]);
});
test('missing stacks and errors are reported distinctly',async()=>{
 const b=new NativeStackBroker(),p=make();b.attach(p);
 const first=b.lookup('Kreis',false,'');
 p.reply({type:'kreis-stack-response',requestId:p.sent[0].requestId,ok:true,tab:null});
 assert.deepEqual(await first,[]);
 const second=b.lookup('Kreis',false,'');
 p.reply({type:'kreis-stack-response',requestId:p.sent[1].requestId,ok:false,error:'Not supported'});
 await assert.rejects(second,/Not supported/);
});
test('disconnect rejects outstanding commands',async()=>{
 const b=new NativeStackBroker(),p=make();b.attach(p);
 const promise=b.lookup('Kreis',false,'');p.close();
 await assert.rejects(promise,/disconnected/);assert.equal(b.connected,false);
});
test('diagnostics cannot leak URLs',async()=>{
 const b=new NativeStackBroker(),p=make();b.attach(p);
 const result=b.diagnose();
 p.reply({type:'kreis-stack-response',requestId:p.sent[0].requestId,ok:true,
 report:{tabCount:46,metadataCount:46,namedStackCount:2,privateAPI:true,privateUrl:'sensitive'}});
 assert.deepEqual(await result,{tabCount:46,metadataCount:46,namedStackCount:2,privateAPI:true});
});
test('invalid input is rejected before reaching the browser',async()=>{
 const b=new NativeStackBroker(),p=make();b.attach(p);
 await assert.rejects(b.lookup('Kreis',true,'file:///secret'),/HTTP\(S\)/);
 assert.equal(p.sent.length,0);
});
