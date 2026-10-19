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
/** Aggregate Vivaldi-specific metadata from every extension-accessible tab source.
 * Chrome's standard Tab shape does not guarantee vivExtData. We inspect, never mutate.
 * Bounded per-tab enrichment prevents enormous browser profiles blocking the launcher.
 * Diagnostics include counts/key names, never tab URLs, titles, or tab IDs. */
export async function inspectVivaldiTabs(api) {
  const queried = await api.tabs.query({});
  const combined = new Map();
  const counters = { query: queried.length, windows: 0, fetched: 0,
    queryData: 0, windowData: 0, fetchedData: 0, groupTabs: 0,
    namedTabs: 0, groupIds: 0, groupTitles: 0, getFailures: 0 };
  const keys = new Set();
  const accept = (tabs, field) => {
    for (const tab of tabs) {
      if (!Number.isInteger(tab?.id)) continue;
      const d = tabData(tab);
      if (d) counters[field]++;
      const previous = combined.get(tab.id);
      if (!previous || (d && !tabData(previous))) combined.set(tab.id, tab);
      for (const name of Object.keys(tab)) {
        if (/viv|group|stack|workspace/i.test(name)) keys.add(name);
      }
    }
  };
  accept(queried, 'queryData');
  try {
    if (typeof api.windows?.getAll === 'function') {
      const windows = await api.windows.getAll({ populate: true, windowTypes: ['normal'] });
      const flattened = windows.flatMap(win => win.tabs || []);
      counters.windows = flattened.length;
      accept(flattened, 'windowData');
    }
  } catch { /* Unsupported extension/host API; tab queries remain valid. */ }

  // When no source exposes Vivaldi metadata, probe per-tab API as a fallback.
  // Cap to avoid overwhelming Vivaldi with hundreds of additional requests.
  const before = [...combined.values()].some(tab => !!tabData(tab));
  if (!before && typeof api.tabs.get === 'function') {
    const ids = [...combined.keys()].slice(0, 250);
    const chunkSize = 12;
    for (let i=0; i<ids.length; i+=chunkSize) {
      const responses = await Promise.allSettled(ids.slice(i,i+chunkSize).map(id=>api.tabs.get(id)));
      const successful=[];
      for (const result of responses) {
        if (result.status === 'fulfilled') { counters.fetched++; successful.push(result.value); }
        else counters.getFailures++;
      }
      accept(successful, 'fetchedData');
    }
  }
  const all = [...combined.values()];
  const groups = new Set(), names = new Set();
  for (const tab of all) {
    const meta = tabData(tab);
    if (typeof meta?.group === 'string' && meta.group) {
      counters.groupTabs++;
      groups.add(meta.group);
    }
    if (typeof meta?.fixedGroupTitle === 'string' && meta.fixedGroupTitle.trim()) {
      counters.namedTabs++;
      names.add(meta.fixedGroupTitle.trim().toLowerCase());
    }
  }
  counters.groupIds = groups.size;
  counters.groupTitles = names.size;
  return { tabs: all, diagnostic: {
    ...counters, total: all.length, getSampleLimit: 250,
    supportedTabFields: [...keys].sort().slice(0, 20),
    metadataAccessible: all.some(tab=>!!tabData(tab))
  }};
}

 /** Identify a named stack; optionally create two entirely new tabs to host it.
 * A missing/unavailable proprietary API causes a visible error, not a wrong-browser fallback.
 * No original closed tabs can be reconstructed from a stack name alone. */
export async function lookupStack(api, name, recreate=false, startUrl='') {
  const clean=String(name||'').trim();
  if (!clean || clean.length>60) throw Error('Stack name must contain 1-60 characters.');
  const {tabs, diagnostic} = await inspectVivaldiTabs(api);
  if (tabs.length && !diagnostic.metadataAccessible)
    throw Error('Vivaldi stack metadata unavailable: ' + diagnostic.query +
      ' queried, ' + diagnostic.windows + ' window tabs, ' +
      diagnostic.fetched + ' individually fetched. No tabs changed.');
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
