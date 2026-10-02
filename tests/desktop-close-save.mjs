import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
let writes=0, backups=0, snapshots=0, saved;
const source={items:{one:{id:'one',title:'Original'}},events:[],metadata:{},schemaVersion:43};
const context=vm.createContext({console,structuredClone,Date,Set,Map,Proxy,Object,JSON,Promise,
  vaultDesktopReady:Promise.resolve({}),localStorage:{getItem:k=>k==='vaultDesktopArchiveMigrated'?'1':null,setItem(){}},
  setTimeout(){throw new Error('Unexpected scheduled backup')},clearTimeout(){},
  fetch:async(url,options)=>{backups++;saved=JSON.parse(options.body).state;return {ok:true}}
});
const database={createSnapshot:async()=>{},databaseEstimate:async()=>({usage:0,quota:0}),ensureDailySnapshot:async()=>{snapshots++},listSnapshots:async()=>[],readPrimaryState:async()=>structuredClone(source),readSnapshot:async()=>{},writePrimaryState:async()=>{writes++},writeStateDelta:async()=>{writes++}};
const migrations={CURRENT_SCHEMA_VERSION:43,migrateSave:s=>s};
const module=new vm.SourceTextModule(fs.readFileSync(new URL('../js/core/store.js',import.meta.url),'utf8'),{context});
await module.link(async spec=>{const values=spec.includes('database')?database:migrations;return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value)},{context})});
await module.evaluate();const store=module.namespace;
await store.initStore({});
for(let i=0;i<50;i++)store.update(s=>{s.items.one.title='Change '+i});
await store.flushPersistence();
assert.equal(writes,0);assert.equal(backups,0);assert.equal(snapshots,0);
assert.equal(store.getState().items.one.title,'Change 49');
const phases=[];
await store.saveDesktopOnClose(async message=>{phases.push({message,writes,backups,snapshots})});
assert.deepEqual(phases.map(p=>[p.writes,p.snapshots,p.backups]),[[0,0,0],[0,0,0],[1,0,0],[1,1,0],[1,1,1]]);
assert.match(phases[0].message,/pending/);
assert.match(phases[4].message,/Saved/);
assert.equal(writes,1);assert.equal(backups,1);assert.equal(snapshots,1);
assert.equal(saved.items.one.title,'Change 49');
console.log('PASS desktop: 50 changes remain in memory; database, snapshot, and backup run on close only');
