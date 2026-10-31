import { BROWSER_OPTIONS, validProfileId } from './browserProfiles.mjs';
import { validateHierarchy } from './groupHierarchy.mjs';

export const SETTINGS_FILE_FORMAT = 'kreis-settings';
export const SETTINGS_FILE_VERSION = 1;
export const MAX_SETTINGS_FILE_BYTES = 2_000_000;
const browserIds = new Set(BROWSER_OPTIONS.map(item => item.id));
const entryTypes = new Set(['browser','vivaldi-stack','app','folder','group','live-tabs']);
const matchModes = new Set(['exact','prefix','site']);
const fonts = new Set(['Inter','Segoe UI','Bahnschrift','Arial','Verdana','Tahoma','Trebuchet MS','Georgia','Consolas','Courier New']);
const colors = { 'live-tabs':'#4c87a8', browser:'#6385d7', 'vivaldi-stack':'#6a8ec2', app:'#438ba8', folder:'#c1a062', group:'#6a8ec2' };
const icons = { 'live-tabs':'layers', browser:'globe', 'vivaldi-stack':'layers', app:'rocket', folder:'folder', group:'folder' };
const own = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
const object = value => value!==null && typeof value==='object' && !Array.isArray(value);
const text = (value,max=4096) => typeof value==='string' && value.length<=max && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value);
const requireString = (value,name,max=4096) => {
  if(!text(value,max))throw Error(name+' must be text (maximum '+max+' characters).');
  return value;
};
const httpUrl = value => {
  try{const parsed=new URL(value);return parsed.protocol==='http:'||parsed.protocol==='https:';}
  catch{return false;}
};
const colorValid = value => /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(value);

export function serializeSettings(settings,date=new Date().toISOString()){
  // Only persistent settings are exported; the pairing token is intentionally
  // stored separately and must never appear in a portable backup.
  return JSON.stringify({
    format:SETTINGS_FILE_FORMAT,version:SETTINGS_FILE_VERSION,
    exportedAt:date,
    settings:{
      shortcut:settings.shortcut,
      appearance:settings.appearance,
      browserProfiles:settings.browserProfiles,
      entries:settings.entries
    }
  },null,2)+'\n';
}

export function parseSettingsImport(contents,current){
  if(typeof contents!=='string'||new TextEncoder().encode(contents).byteLength>MAX_SETTINGS_FILE_BYTES)
    throw Error('Choose a JSON file no larger than 2 MB.');
  let raw;
  try{raw=JSON.parse(contents);}catch{throw Error('The selected file is not valid JSON.');}
  if(!object(raw))throw Error('The settings JSON must contain an object.');
  if(own(raw,'format')&&raw.format!==SETTINGS_FILE_FORMAT)
    throw Error('This is not a Kreis settings file.');
  if(own(raw,'version')&&raw.version!==SETTINGS_FILE_VERSION)
    throw Error('Unsupported Kreis settings file version. This app supports version 1.');
  if(own(raw,'settings')&&!object(raw.settings))
    throw Error('The "settings" field must contain an object.');
  const input=own(raw,'settings')?raw.settings:raw;
  const fields=['entries','browserProfiles','appearance','shortcut'].filter(name=>own(input,name));
  if(!fields.length)throw Error('No importable settings found. Include "entries", "browserProfiles", "appearance" or "shortcut".');
  const warnings=[];
  let profiles=current.browserProfiles.map(p=>({...p}));
  if(own(input,'browserProfiles')){
    if(!Array.isArray(input.browserProfiles)||input.browserProfiles.length>100)
      throw Error('Browser profiles must be an array with at most 100 entries.');
    const seen=new Set();
    profiles=input.browserProfiles.map((p,index)=>{
      const prefix='Browser profile '+(index+1);
      if(!object(p)||!validProfileId(p.id)||!browserIds.has(p.browserId)||
        !text(p.name,48)||!p.name.trim()||seen.has(p.id))
        throw Error(prefix+' has an invalid/duplicate ID, name or browser.');
      seen.add(p.id);
      return {id:p.id,name:p.name.trim(),browserId:p.browserId};
    });
  }
  let entries=current.entries.map(e=>({...e}));
  if(own(input,'entries')){
    if(!Array.isArray(input.entries)||input.entries.length>1000)
      throw Error('Shortcuts must be an array with at most 1000 entries.');
    entries=input.entries.map((entry,index)=>{
      const label='Shortcut '+(index+1);
      if(!object(entry)||!entryTypes.has(entry.type))
        throw Error(label+' needs a valid type: browser, vivaldi-stack, app, folder, group or live-tabs.');
      const type=entry.type;
      const id=own(entry,'id')?requireString(entry.id,label+' ID',128):'kreis-import-'+(index+1);
      if(!id.trim())throw Error(label+' needs a nonempty ID.');
      const title=requireString(entry.title,label+' title',100).trim();
      if(!title)throw Error(label+' needs a title.');
      const target=entry.target===undefined&&type==='group'?'':type==='live-tabs'?'connected':requireString(entry.target,label+' target');
      if(type!=='group'&&!target.trim())throw Error(label+' needs a target.');
      if(type==='browser'&&!httpUrl(target))throw Error(label+' needs an HTTP(S) website URL.');
      if(type==='vivaldi-stack'&&target.trim().length>60)
        throw Error(label+' has a stack name longer than 60 characters.');
      const profileId=own(entry,'profileId')?requireString(entry.profileId,label+' profile ID',72):
        own(entry,'profile')?requireString(entry.profile,label+' profile ID',72):
        (profiles[0]?.id||'');
      const profile=own(entry,'profile')?requireString(entry.profile,label+' legacy profile',72):profileId;
      const match=entry.match===undefined?(type==='browser'||type==='vivaldi-stack'?'exact':'prefix'):entry.match;
      if(!matchModes.has(match))throw Error(label+' has an unknown match mode.');
      const icon=entry.icon===undefined?icons[type]:requireString(entry.icon,label+' icon',60);
      if(!icon.trim())throw Error(label+' needs an icon.');
      const color=entry.color===undefined?colors[type]:requireString(entry.color,label+' color',9);
      if(!colorValid(color))throw Error(label+' needs a hex color, e.g. #6385d7.');
      const normalized={id,title,type,target,profile,match,icon,color};
      if(own(entry,'groupId')&&entry.groupId!==null&&entry.groupId!=='')
        normalized.groupId=requireString(entry.groupId,label+' parent ID',128);
      if(type==='browser'||type==='vivaldi-stack'){
        normalized.profileId=profileId;
        const linked=profiles.find(p=>p.id===profileId);
        if(profileId&&!linked)throw Error(label+' refers to missing browser profile "'+profileId+'".');
        const browserId=linked?.browserId||entry.browserId||'vivaldi';
        if(!browserIds.has(browserId))throw Error(label+' has an invalid browser.');
        if(type==='vivaldi-stack'&&linked&&linked.browserId!=='vivaldi')
          throw Error(label+' is a Vivaldi stack but points to a non-Vivaldi browser profile.');
        normalized.browserId=browserId;
        if(!profileId)warnings.push('"' + title + '" has no browser profile assigned.');
      }
      if(type==='vivaldi-stack'){
        if(own(entry,'recreateStack')){
          if(typeof entry.recreateStack!=='boolean')throw Error(label+' recreation flag must be true or false.');
          normalized.recreateStack=entry.recreateStack;
        }
        if(own(entry,'stackStartUrl')&&entry.stackStartUrl!==null&&entry.stackStartUrl!==''){
          const start=requireString(entry.stackStartUrl,label+' starting URL');
          if(!httpUrl(start))throw Error(label+' needs an HTTP(S) stack starting URL.');
          normalized.stackStartUrl=start;
        }
      }
      if((type==='browser'||type==='app')&&own(entry,'windowTitle')&&entry.windowTitle!==null&&entry.windowTitle!=='')
        normalized.windowTitle=requireString(entry.windowTitle,label+' window title',200);
      return normalized;
    });
  }
  const structural=validateHierarchy(entries,12);
  if(structural)throw Error(structural);
  // v0.x allowed 11/12 radial slices; backups must not discard those layouts.
  const counts=new Map();
  for(const entry of entries){
    const parent=entry.groupId||'';
    counts.set(parent,(counts.get(parent)||0)+1);
  }
  if([...counts.values()].some(n=>n>10))
    warnings.push('This layout contains a legacy 11/12-slice group. Kreis preserves it, but new groups are limited to 10 slices.');
  // Profile-only imports must also keep all existing browser shortcuts valid.
  for(const [index,entry] of entries.entries()){
    if(entry.type!=='browser'&&entry.type!=='vivaldi-stack')continue;
    const id=entry.profileId??entry.profile;
    const linked=profiles.find(p=>p.id===id);
    if(id&&!linked)throw Error('Shortcut '+(index+1)+' references missing browser profile "'+id+'".');
    if(linked&&entry.type==='vivaldi-stack'&&linked.browserId!=='vivaldi')
      throw Error('Shortcut '+(index+1)+' needs a Vivaldi browser profile.');
  }
  let appearance={...current.appearance};
  if(own(input,'appearance')){
    if(!object(input.appearance))throw Error('Appearance must be an object.');
    appearance={...appearance,...input.appearance};
    if(!fonts.has(appearance.fontFamily)||
       !Number.isInteger(appearance.labelSize)||appearance.labelSize<10||appearance.labelSize>18||
       !Number.isInteger(appearance.centerSize)||appearance.centerSize<13||appearance.centerSize>24)
      throw Error('Appearance has an unsupported font or out-of-range text size.');
    appearance={fontFamily:appearance.fontFamily,labelSize:appearance.labelSize,centerSize:appearance.centerSize};
  }
  const shortcut=own(input,'shortcut')?requireString(input.shortcut,'Global hotkey',80).trim():current.shortcut;
  if(!shortcut)throw Error('Global hotkey cannot be empty.');
  const settings={shortcut,appearance,entries,browserProfiles:profiles};
  return {
    settings,fields,warnings,
    summary:{
      shortcuts:entries.filter(e=>e.type!=='group').length,
      groups:entries.filter(e=>e.type==='group').length,
      browserProfiles:profiles.length,
      hotkey:shortcut,
      entriesChanged:own(input,'entries'),
      profilesChanged:own(input,'browserProfiles'),
      hotkeyChanged:own(input,'shortcut'),
      appearanceChanged:own(input,'appearance')
    }
  };
}
