import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultBrowserProfiles, normalizeBrowserSettings, profileForEntry,
  addBrowserProfile, renameBrowserProfile, deleteBrowserProfile, assignProfile
} from '../src/browserProfiles.mjs';

const oldEntry = { id:'a',title:'Existing',type:'browser',target:'https://example.com',
  profile:'Work',match:'prefix',icon:'globe',color:'#112233' };
const current = () => ({ shortcut:'Control+Space',appearance:{fontFamily:'Inter',labelSize:12,centerSize:16},
  entries:[oldEntry], browserProfiles:defaultBrowserProfiles() });
test('legacy Work and Personal Vivaldi identities survive the migration', () => {
  const migrated = normalizeBrowserSettings({ ...current(),browserProfiles:undefined });
  assert.deepEqual(migrated.browserProfiles,defaultBrowserProfiles());
  assert.equal(migrated.entries[0].profileId,'Work');
  assert.equal(migrated.entries[0].browserId,'vivaldi');
  assert.equal(profileForEntry(migrated.entries[0],migrated.browserProfiles).name,'Work');
  assert.deepEqual(normalizeBrowserSettings(migrated),migrated);
});
test('new profiles with duplicate visible names in different browsers remain distinct', () => {
  let profiles = defaultBrowserProfiles();
  const added = addBrowserProfile(profiles,'Work','chrome','chrome-x');
  assert.equal(added.error,undefined);
  profiles=added.profiles;
  const assigned=assignProfile(oldEntry, profiles[2]);
  assert.equal(assigned.profileId,'chrome-x');
  assert.equal(assigned.browserId,'chrome');
  assert.equal(profileForEntry(assigned,profiles).browserId,'chrome');
  assert.match(addBrowserProfile(profiles,'wOrK','chrome','chrome-y').error,/already/);
});
test('rename updates the display label without changing IDs or shortcut references', () => {
  const profiles=defaultBrowserProfiles();
  const renamed=renameBrowserProfile(profiles,'Work','Projects');
  assert.deepEqual(renamed.profiles[0],{id:'Work',name:'Projects',browserId:'vivaldi'});
  assert.equal(profileForEntry(normalizeBrowserSettings({...current(),browserProfiles:renamed.profiles}).entries[0],renamed.profiles).name,'Projects');
  assert.equal(renamed.profiles[0].id,oldEntry.profile);
});
test('delete safely reassigns, or retains shortcuts explicitly unassigned', () => {
  const settings=current();
  const unassigned=deleteBrowserProfile(settings,'Work').settings;
  assert.equal(unassigned.entries[0].profileId,'');
  assert.equal(profileForEntry(unassigned.entries[0],unassigned.browserProfiles),null);
  assert.equal(unassigned.entries.length,1);
  assert.equal(unassigned.browserProfiles.some(p=>p.id==='Work'),false);
  const moved=deleteBrowserProfile(settings,'Work','Personal').settings;
  assert.equal(moved.entries[0].profileId,'Personal');
  assert.equal(settings.entries[0].profile,'Work');
  assert.match(deleteBrowserProfile(settings,'Work','missing').error,/Replacement/);
});
test('explicit empty registry remains empty across restarts and never resurrects old profiles', () => {
  const cleared=normalizeBrowserSettings({ ...current(),browserProfiles:[],entries:[{...oldEntry,profileId:''}] });
  assert.deepEqual(cleared.browserProfiles,[]);
  assert.equal(profileForEntry(cleared.entries[0],cleared.browserProfiles),null);
});
test('invalid registrations are rejected without mutating existing profiles',()=>{
 const profiles=defaultBrowserProfiles();
 assert.ok(addBrowserProfile(profiles,' ','edge','uuid').error);
 assert.ok(addBrowserProfile(profiles,'New','unknown','uuid').error);
 assert.ok(addBrowserProfile(profiles,'New','chrome','bad id').error);
 assert.ok(renameBrowserProfile(profiles,'missing','Hi').error);
 assert.ok(renameBrowserProfile(profiles,'Work','Personal').error);
 assert.equal(profiles[0].name,'Work');
});
