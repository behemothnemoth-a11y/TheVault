const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('js/wings/calendar.js','utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
const state={items:{},preferences:{calendar:{dismissedSuggestions:['hidden'],addedSuggestions:[]}},metadata:{calendar:{suggestions:[{id:'old-local',category:'local'},{id:'old-premiere',category:'premiere'}]}}};
let reads=0;
const context=vm.createContext({console,Date,Set,Map,Promise,getState:()=>state,update:fn=>fn(state),renderAtomicWingShell:()=>'',fetch:async(url,options)=>{
 const body=JSON.parse(options.body);
 if(url.endsWith('/events')){reads++;return {ok:false,json:async()=>({error:'offline'})};}
 if(body.category==='local')throw new Error('Local unavailable');
 return {ok:true,json:async()=>({ready:true,suggestions:[{id:body.category,category:body.category},{id:'hidden',category:body.category}]})};
}});
vm.runInContext(source,context);
(async()=>{
 await vm.runInContext('loadCalendar(()=>{})',context);
 await vm.runInContext('loadCalendar(()=>{})',context);
 assert.equal(reads,1,'Failed load must not loop on redraw');
 await vm.runInContext('loadCalendar(()=>{},true)',context);
 assert.equal(reads,2,'Explicit retry must still work');
 const result=await vm.runInContext('refreshCalendarSuggestions()',context);
 assert.equal(result.partial,true);
 assert(state.metadata.calendar.suggestions.some(x=>x.id==='old-local'),'Failed lane must preserve saved results');
 assert(!state.metadata.calendar.suggestions.some(x=>x.id==='old-premiere'),'Successful lane replaces old results');
 assert(!state.metadata.calendar.suggestions.some(x=>x.id==='hidden'),'Dismissed result must not return');
 console.log('PASS: failed calendar reads, explicit retry, partial results, dismissal memory');
})().catch(error=>{console.error(error);process.exitCode=1});
