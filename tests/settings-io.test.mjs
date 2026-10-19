import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeSettings, parseSettingsImport, SETTINGS_FILE_FORMAT, SETTINGS_FILE_VERSION } from '../src/settingsIO.mjs';
const base=()=>({
  shortcut:'Control+Space',
  appearance:{fontFamily:'Inter',labelSize:12,centerSize:16},
  browserProfiles:[{id:'Work',name:'Work',browserId:'vivaldi'}],
  entries:[
    {id:'g',title:'Projects',type:'group',target:'',profile:'Work',match:'prefix',icon:'folder',color:'#123456'},
    {id:'a',title:'Runagaldr',type:'vivaldi-stack',target:'Runagaldr',
      groupId:'g',profile:'Work',profileId:'Work',browserId:'vivaldi',
      match:'exact',icon:'layers',color:'#6385d7',recreateStack:true,stackStartUrl:'https://runagaldr.com'}
  ]
});
test('round-trips full settings and preserves IDs, nesting, browser profiles and stack options',()=>{
  const initial=base();
  const raw=serializeSettings(initial,'2026-10-19T00:00:00.000Z');
  const json=JSON.parse(raw);
  assert.equal(json.format,SETTINGS_FILE_FORMAT);
  assert.equal(json.version,SETTINGS_FILE_VERSION);
  assert.deepEqual(Object.keys(json.settings),['shortcut','appearance','browserProfiles','entries']);
  const result=parseSettingsImport(raw,base());
  assert.deepEqual(result.settings,initial);
  assert.equal(result.summary.groups,1);
  assert.equal(result.summary.shortcuts,1);
});
test('imports AI-written shortcuts-only JSON without resetting other preferences',()=>{
  const original=base();
  const raw=JSON.stringify({entries:[
    {id:'some-site',title:'Website',type:'browser',target:'https://example.com/',profileId:'Work',groupId:'group'},
    {id:'group',title:'My group',type:'group',target:''}
  ]});
  const result=parseSettingsImport(raw,original);
  assert.equal(result.settings.shortcut,original.shortcut);
  assert.deepEqual(result.settings.appearance,original.appearance);
  assert.deepEqual(result.settings.browserProfiles,original.browserProfiles);
  assert.equal(result.settings.entries[0].groupId,'group');
  assert.equal(result.settings.entries[0].icon,'globe');
  assert.deepEqual(result.fields,['entries']);
});
test('supports replacing browser profiles and hotkey without touching shortcuts',()=>{
  const original=base();
  const result=parseSettingsImport(JSON.stringify({settings:{
    browserProfiles:[{id:'Work',name:'Workstation',browserId:'vivaldi'}],
    shortcut:'Control+Alt+P',
    appearance:{fontFamily:'Consolas'}
  }}),original);
  assert.equal(result.settings.entries.length,2);
  assert.equal(result.settings.browserProfiles[0].name,'Workstation');
  assert.equal(result.settings.shortcut,'Control+Alt+P');
  assert.equal(result.settings.appearance.labelSize,12);
  assert.equal(result.settings.appearance.fontFamily,'Consolas');
});
test('rejects unsupported future formats or malformed JSON',()=>{
  for(const value of ['oops','[]','{}','{"format":"someone-else","entries":[]}',
     '{"format":"kreis-settings","version":99,"settings":{"entries":[]}}']){
    assert.throws(()=>parseSettingsImport(value,base()));
  }
});
test('never loses saved entries due to a missing or cyclic group',()=>{
  const original=base();
  const wrong=[
    [{id:'a',title:'A',type:'group',groupId:'not-a-group'}],
    [{id:'a',title:'A',type:'group',groupId:'b'},{id:'b',title:'B',type:'group',groupId:'a'}],
    [{id:'a',title:'A',type:'group'},{id:'a',title:'Duplicate',type:'group'}]
  ];
  for(const entries of wrong)assert.throws(()=>parseSettingsImport(JSON.stringify({entries}),original));
  assert.equal(original.entries.length,2);
});
test('blocks corrupt/missing profile references and incompatible Vivaldi profiles',()=>{
  const original=base();
  assert.throws(()=>parseSettingsImport(JSON.stringify({entries:[
    {id:'x',type:'browser',title:'X',target:'https://example.com',profileId:'gone'}
  ]}),original),/missing browser profile/);
  assert.throws(()=>parseSettingsImport(JSON.stringify({browserProfiles:[
    {id:'Work',name:'Chrome',browserId:'chrome'}
  ]}),original),/Vivaldi browser profile/);
});
test('checks shortcut URL validity, invalid colors and max sizes',()=>{
  const original=base();
  for(const entry of [
    {id:'a',type:'browser',title:'Bad',target:'file:///secrets'},
    {id:'b',type:'app',title:'Bad',target:'Code.exe',color:'red'},
    {id:'c',type:'vivaldi-stack',title:'Bad',target:'Test',stackStartUrl:'javascript:evil'}
  ])assert.throws(()=>parseSettingsImport(JSON.stringify({entries:[entry]}),original));
  assert.throws(()=>parseSettingsImport(' '.repeat(2_000_001),original),/2 MB/);
});
test('permits old 12-slice wheels but rejects 13 and notes legacy layout',()=>{
  const original=base();
  const getItems=n=>Array.from({length:n},(_,i)=>({id:'x'+i,type:'app',title:'A'+i,target:'notepad.exe'}));
  const accepted=parseSettingsImport(JSON.stringify({entries:getItems(12)}),original);
  assert.ok(accepted.warnings.some(x=>/legacy/.test(x)));
  assert.throws(()=>parseSettingsImport(JSON.stringify({entries:getItems(13)}),original),/12 items/);
});
test('empty entries intentionally replaces shortcuts, never silently populating starters',()=>{
  const original=base();
  const result=parseSettingsImport('{"entries":[]}',original);
  assert.deepEqual(result.settings.entries,[]);
  assert.equal(result.settings.browserProfiles.length,1);
});
