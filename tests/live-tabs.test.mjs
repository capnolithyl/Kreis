import test from 'node:test';
import assert from 'node:assert/strict';
import {tabDomain,groupLiveTabs} from '../src/liveTabs.mjs';
const profile=(id,name,browserId='vivaldi')=>({id,name,browserId});
const tab=(id,url,title='Tab',windowId=3)=>({id,url,title,windowId});

test('host grouping keeps distinct Google subdomains and removes www',()=>{
  assert.equal(tabDomain('https://www.example.com/blog'),'example.com');
  assert.equal(tabDomain('https://mail.google.com/mail/u/0'),'mail.google.com');
  assert.equal(tabDomain('https://chat.google.com/'),'chat.google.com');
  assert.equal(tabDomain('chrome://settings'),null);
  assert.equal(tabDomain('file:///C:/secret'),null);
  assert.equal(tabDomain('bad url'),null);
});

test('groups all windows by configured browser profile, then by domain',()=>{
  const result=groupLiveTabs([
    {profile:profile('Work','Work'),tabs:[
      tab(1,'https://www.example.com/','Home',5),
      tab(2,'https://example.com/blog','Blog',9),
      tab(3,'https://chat.google.com/u/0/','Chat')
    ]},
    {profile:profile('Personal','Personal','chrome'),tabs:[
      tab(4,'https://example.com','Personal website',2),
      tab(5,'chrome://history','Browser internal',2)
    ]}
  ]);
  assert.equal(result.profiles.length,2);
  assert.deepEqual(result.profiles[0].domains.map(d=>[d.domain,d.tabs.length]),
    [['example.com',2],['chat.google.com',1]]);
  assert.equal(result.profiles[0].domains[0].tabs[0].windowId,5);
  assert.equal(result.profiles[1].profile.browserId,'chrome');
  assert.equal(result.profiles[1].tabCount,1);
});

test('records unavailable profiles but does not invent tabs',()=>{
  const result=groupLiveTabs([
    {profile:profile('Work','Work'),tabs:null},
    {profile:profile('Personal','Personal'),tabs:[tab(6,'about:blank')]}
  ]);
  assert.equal(result.profiles.length,0);
  assert.deepEqual(result.unavailable,['Work (vivaldi)']);
});

test('deduplicates tab IDs and ignores unusable URLs or missing IDs',()=>{
  const result=groupLiveTabs([
    {profile:profile('Work','Work'),tabs:[
      tab(1,'https://example.org/a'),tab(1,'https://example.org/b'),
      tab(2,'https://example.org/c'),{id:-1,url:'https://example.org'},
      {id:3,windowId:7,url:'javascript:alert(1)',title:'JS'}
    ]}
  ]);
  assert.equal(result.profiles[0].tabCount,2);
});

test('fresh input is grouped every invocation rather than cached',()=>{
  const p=profile('Work','Work');
  const first=groupLiveTabs([{profile:p,tabs:[tab(1,'https://a.org')]}]);
  const second=groupLiveTabs([{profile:p,tabs:[tab(2,'https://b.org')]}]);
  assert.equal(first.profiles[0].domains[0].domain,'a.org');
  assert.equal(second.profiles[0].domains[0].domain,'b.org');
});
