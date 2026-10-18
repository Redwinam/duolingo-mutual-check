import test from 'node:test';
import assert from 'node:assert/strict';
import {compare,normalizeSnapshot,appendSnapshot} from '../src/core.js';
const u=(id,name=`用户${id}`)=>({id:String(id),name,username:`user${id}`});
const snapshot=(following,followers,extra={})=>({schema:1,source:'duolingo-web-friends-v1',complete:true,capturedAt:'2026-10-18T12:00:00Z',account:u(99),following:following.map(x=>typeof x==='object'?x:u(x)),followers:followers.map(x=>typeof x==='object'?x:u(x)),...extra});
test('equal counts can still contain different people',()=>{
  const r=compare(snapshot([1,2],[1,3]));
  assert.deepEqual(r.needFollowBack.map(u=>u.id),['3']);
  assert.deepEqual(r.notFollowingBack.map(u=>u.id),['2']);
  assert.equal(r.mutual,1);
});
test('first scan never invents a history of unfollows',()=>{
  const r=compare(snapshot([1,2],[1]));
  assert.equal(r.hasBaseline,false);assert.deepEqual(r.lostFollowers,[]);assert.deepEqual(r.newFollowers,[]);
});
test('compares identity rather than display name, with simultaneous additions and removals',()=>{
  const r=compare(snapshot([u(1,'改名'),u(3,'同名')],[u(1,'改名'),u(3,'同名')]),snapshot([1,2],[u(1,'旧名'),u(2,'同名')]));
  assert.deepEqual(r.newFollowers.map(u=>u.id),['3']);
  assert.deepEqual(r.lostFollowers.map(u=>u.id),['2']);
});
test('different accounts, partial lists and duplicate identities are rejected',()=>{
  assert.throws(()=>compare(snapshot([1],[1]),snapshot([1],[1],{account:u(88)})),/不同账号/);
  assert.throws(()=>normalizeSnapshot(snapshot([],[],{complete:false})),/未完整/);
  assert.throws(()=>normalizeSnapshot(snapshot([1,1],[1])),/重复/);
});
test('storage and exports only contain whitelisted fields',()=>{
  const s=normalizeSnapshot(snapshot([{...u(1),unrelatedSecret:'omit'}],[1],{unrelatedSecret:'omit'}));
  assert.equal(JSON.stringify(s).includes('omit'),false);
});
test('history retains 30 scans and rejects mixed accounts',()=>{
  const s=snapshot([1],[1]);
  assert.equal(appendSnapshot(Array(30).fill(s),s).length,30);
  assert.throws(()=>appendSnapshot([snapshot([1],[1],{account:u(88)})],s),/账号不一致/);
});
