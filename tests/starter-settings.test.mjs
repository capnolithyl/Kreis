import test from 'node:test';
import assert from 'node:assert/strict';
import { createStarterEntries, selectInitialSettings } from '../src/starterSettings.mjs';
import { getChildren, validateHierarchy } from '../src/groupHierarchy.mjs';

const appearance = { fontFamily: 'Inter', labelSize: 12, centerSize: 16 };
const defaults = () => ({ shortcut: 'Control+Space', appearance, entries: createStarterEntries() });
const normalize = value => value || appearance;

test('fresh-install starter set is neutral, valid and represents the supported entry types', () => {
  const entries = createStarterEntries();
  assert.equal(validateHierarchy(entries, 10), null);
  assert.equal(new Set(entries.map(e => e.id)).size, entries.length);
  assert.ok(entries.length >= 6);
  assert.deepEqual(getChildren(entries).map(e => e.title),
    ['Google','YouTube','Wikipedia','Downloads','Tools']);
  assert.deepEqual(getChildren(entries, 'starter-tools').map(e => e.title), ['GitHub','Notepad']);
  assert.deepEqual(new Set(entries.map(e => e.type)), new Set(['browser','folder','group','app']));
  for (const entry of entries) {
    assert.ok(entry.title && entry.icon && /^#[a-f0-9]{6}$/i.test(entry.color));
    assert.ok(entry.profile === 'Personal');
    if (entry.type === 'browser') {
      assert.equal(new URL(entry.target).protocol, 'https:');
      assert.equal(entry.windowTitle, undefined);
    }
  }
  assert.equal(entries.find(e => e.id === 'starter-downloads').target, 'shell:Downloads');
  assert.equal(entries.find(e => e.id === 'starter-notepad').target, 'notepad.exe');
  const serialized = JSON.stringify(entries).toLowerCase();
  for (const privateTerm of ['ihm','ihmcfo','runagaldr','archbalt','marcusborger','chatgpt.com/c/']) {
    assert.equal(serialized.includes(privateTerm), false, `No private term: ${privateTerm}`);
  }
});

test('starter instances do not share mutable shortcut objects', () => {
  const first = createStarterEntries();
  first[0].title = 'Changed';
  assert.equal(createStarterEntries()[0].title, 'Google');
});

test('a genuinely absent configuration gets one persistent starter layout', () => {
  const fresh = selectInitialSettings(undefined, defaults(), normalize);
  assert.equal(fresh.isFirstRun, true);
  assert.equal(fresh.settings.entries[0].title, 'Google');
  assert.notEqual(fresh.settings.entries, defaults().entries);
  const reopened = selectInitialSettings(fresh.settings, defaults(), normalize);
  assert.equal(reopened.isFirstRun, false);
  assert.deepEqual(reopened.settings.entries, fresh.settings.entries);
});

test('existing custom entries survive intact across upgrades', () => {
  const saved = {
    shortcut: 'Alt+Shift+Space',
    appearance: { fontFamily: 'Arial', labelSize: 14, centerSize: 18 },
    entries: [
      { id:'project', title:'Private Workspace', type:'group', target:'' },
      { id:'sub', groupId:'project', title:'My Page', type:'browser', target:'https://custom.example/', profile:'Work', match:'exact' }
    ]
  };
  const result = selectInitialSettings(saved, defaults(), normalize);
  assert.equal(result.isFirstRun, false);
  assert.deepEqual(result.settings.entries, saved.entries);
  assert.equal(result.settings.shortcut, saved.shortcut);
  assert.deepEqual(result.settings.appearance, saved.appearance);
});

test('an intentional empty list stays empty, never repopulated with starters', () => {
  const result = selectInitialSettings({shortcut:'Control+Space',entries:[]},defaults(),normalize);
  assert.equal(result.isFirstRun, false);
  assert.deepEqual(result.settings.entries, []);
});

test('malformed or legacy-missing entries receive safe first-run defaults', () => {
  for (const invalid of [null, undefined, {}, { entries: null }, {entries:'invalid'}]) {
    const result = selectInitialSettings(invalid, defaults(), normalize);
    assert.equal(result.isFirstRun, true);
    assert.ok(result.settings.entries.length > 0);
  }
});
