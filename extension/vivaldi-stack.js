/** Vivaldi native tab stacks are NOT Chromium tab groups.
 * Experimental vivExtData support: never rewrite an existing user tab. */
export function tabData(tab) {
  const raw = tab?.vivExtData;
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try { const v=JSON.parse(raw); return v && typeof v==='object' && !Array.isArray(v) ? v : null; }
  catch { return null; }
}
export function namedStack(tabs, name) {
  const wanted=String(name).trim().toLowerCase(), ids=new Set();
  for (const t of tabs) {
    const data=tabData(t);
    if (data?.group && typeof data.fixedGroupTitle==='string' && data.fixedGroupTitle.trim().toLowerCase()===wanted)
      ids.add(data.group);
  }
  const members=tabs.filter(t=>ids.has(tabData(t)?.group));
  return members.find(t=>t.active) || members[0] || null;
}
/** Identify a named stack; optionally create two entirely new tabs to host it.
 * A missing/unavailable proprietary API causes a visible error, not a wrong-browser fallback.
 * No original closed tabs can be reconstructed from a stack name alone. */
export async function lookupStack(api, name, recreate=false, startUrl='') {
  const clean=String(name||'').trim();
  if (!clean || clean.length>60) throw Error('Stack name must contain 1-60 characters.');
  const tabs=await api.tabs.query({});
  if (tabs.length && !tabs.some(t=>tabData(t)!==null))
    throw Error('Vivaldi native stack metadata is unavailable to the extension. No tabs changed.');
  const found=namedStack(tabs,clean);
  if (found) return [found];
  if (!recreate) return [];
  if (!tabs.length) throw Error('Open a Vivaldi tab first to verify native stack support.');
  if (startUrl) { let u; try{u=new URL(startUrl)}catch{throw Error('Invalid starting URL')};
    if(!['https:','http:'].includes(u.protocol))throw Error('Only HTTP(S) starting URLs are supported.'); }
  const win=await api.windows.getLastFocused({windowTypes:['normal']});
  if (!Number.isInteger(win?.id)) throw Error('No Vivaldi window available.');
  const made=[];
  try {
    for (const url of [startUrl||'about:blank','about:blank']) {
      const t=await api.tabs.create({windowId:win.id,url,active:false});
      if (!Number.isInteger(t?.id)) throw Error('Could not create the stack tab.');
      made.push(t.id);
    }
    const group=crypto.randomUUID();
    for (const id of made) {
      const t=await api.tabs.get(id);
      await api.tabs.update(id,{vivExtData:JSON.stringify({...tabData(t),group,fixedGroupTitle:clean})});
    }
    const checked=await Promise.all(made.map(id=>api.tabs.get(id)));
    if (!checked.every(t=>tabData(t)?.group===group && tabData(t)?.fixedGroupTitle===clean))
      throw Error('Vivaldi ignored native stack metadata. Creation is not supported in this version.');
    return [checked[0]];
  } catch(err) {
    if(made.length) try{await api.tabs.remove(made)}catch{}
    throw err;
  }
}
