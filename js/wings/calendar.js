import { getState, update } from "../core/store.js";
import { renderAtomicWingShell } from "../ui/atomicWingShell.js";
import { closeModal, openModal } from "../ui/modals.js";
import { toast } from "../ui/notifications.js";

const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const runtime={month:new Date(new Date().getFullYear(),new Date().getMonth(),1),events:[],loadedKey:"",loadedAt:0,loading:false,error:"",timeZone:"",view:"month"};
const monthKey=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
const post=async(path,requestName,body={})=>{const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json","X-Vault-Request":requestName},body:JSON.stringify(body)});const result=await response.json();if(!response.ok||result.ready===false)throw new Error(result.detail||result.error||"Calendar request unavailable");return result};

export function ensureCalendar(){update(save=>{save.preferences.calendar||={dismissedSuggestions:[],addedSuggestions:[]};save.metadata.calendar||={suggestions:[],generatedAt:""}})}

// The grid draws 42 cells, starting on the Sunday before the 1st and running past
// the end of the month, so the fetch has to cover those days too. Asking only for
// the 1st to the 1st left every visible neighbouring day permanently empty.
function datesForMonth(){
  const first=new Date(runtime.month.getFullYear(),runtime.month.getMonth(),1);
  const start=new Date(first.getFullYear(),first.getMonth(),1-first.getDay());
  const end=new Date(start.getFullYear(),start.getMonth(),start.getDate()+42);
  return{timeMin:start.toISOString(),timeMax:end.toISOString()};
}
// Anything older than this is refetched when the room is opened, so an event added
// on a phone shows up without having to press REFRESH.
const CALENDAR_STALE_MS=2*60*1000;
export async function loadCalendar(onChanged=()=>{},force=false){
  const key=monthKey(runtime.month);
  const fresh=runtime.loadedKey===key&&Date.now()-Number(runtime.loadedAt||0)<CALENDAR_STALE_MS;
  if(runtime.loading||(!force&&fresh))return;
  runtime.loading=true;runtime.error="";
  try{
    const result=await post("/__vault/calendar/events","calendar-events",datesForMonth());
    if(monthKey(runtime.month)===key){runtime.events=result.events||[];runtime.timeZone=result.timeZone||runtime.timeZone}
    runtime.loadedKey=key;runtime.loadedAt=Date.now();
    return true;
  }catch(error){runtime.error=error.message;runtime.loadedKey=key;runtime.loadedAt=Date.now();return false}
  finally{runtime.loading=false;onChanged()}
}
export function moveCalendarMonth(amount,onChanged){runtime.month=new Date(runtime.month.getFullYear(),runtime.month.getMonth()+amount,1);runtime.loadedKey="";loadCalendar(onChanged,true);onChanged()}
export function returnCalendarToday(onChanged){runtime.month=new Date(new Date().getFullYear(),new Date().getMonth(),1);runtime.loadedKey="";loadCalendar(onChanged,true);onChanged()}

function tasteSignals(){const wings=["tv","movies","books","manga","games","music"],eligible=Object.values(getState().items||{}).filter(item=>wings.includes(item.wing)&&item.title&&(item.favorite||Number(item.rating||0)>=7||["completed","watching","reading","playing"].includes(item.status))),rank=(a,b)=>Number(Boolean(b.favorite))-Number(Boolean(a.favorite))||Number(b.rating||0)-Number(a.rating||0)||Date.parse(b.updatedAt||b.addedAt||0)-Date.parse(a.updatedAt||a.addedAt||0),picked=[],seen=new Set;for(const wing of wings){for(const item of eligible.filter(value=>value.wing===wing).sort(rank).slice(0,14)){if(!seen.has(item.id)){seen.add(item.id);picked.push(item)}}}for(const item of eligible.sort(rank)){if(picked.length>=110)break;if(!seen.has(item.id)){seen.add(item.id);picked.push(item)}}return picked.slice(0,110).map(item=>`${item.wing}: ${item.title}${item.genres?.length?` [${item.genres.slice(0,4).join(", ")}]`:""}`)}
export async function refreshCalendarSuggestions(onChanged=()=>{},onProgress=()=>{}){const state=getState(),prefs=state.preferences.calendar||{},excluded=[...(prefs.dismissedSuggestions||[]),...(prefs.addedSuggestions||[])],interests=tasteSignals(),categories=["local","within_3_hours","premiere"];onProgress("Searching local events, road-trip options, and premieres independently…");let attempts=await Promise.allSettled(categories.map(category=>post("/__vault/calendar/suggestions","calendar-suggestions",{category,interests,excluded})));const failed=attempts.map((result,index)=>result.status==="rejected"?categories[index]:"").filter(Boolean);if(failed.length){onProgress(`Retrying ${failed.length} interrupted recommendation lane${failed.length===1?"":"s"}…`);const retries=await Promise.allSettled(failed.map(category=>post("/__vault/calendar/suggestions","calendar-suggestions",{category,interests:interests.slice(0,60),excluded})));let retryIndex=0;attempts=attempts.map(result=>result.status==="fulfilled"?result:retries[retryIndex++])}const successes=attempts.filter(result=>result.status==="fulfilled").map(result=>result.value),suggestions=successes.flatMap(result=>result.suggestions||[]);if(!successes.length)throw new Error(attempts.find(result=>result.status==="rejected")?.reason?.message||"Calendar suggestions unavailable");const result={ready:true,suggestions,generatedAt:new Date().toISOString(),partial:successes.length<categories.length};update(save=>{save.metadata.calendar||={};const successfulCategories=new Set(categories.filter((category,index)=>attempts[index].status==="fulfilled"));const currentPrefs=save.preferences.calendar||{};const hidden=new Set([...(currentPrefs.dismissedSuggestions||[]),...(currentPrefs.addedSuggestions||[])]);save.metadata.calendar.suggestions=[...(save.metadata.calendar.suggestions||[]).filter(item=>!successfulCategories.has(item.category)),...suggestions].filter(item=>!hidden.has(item.id));save.metadata.calendar.failedCategories=categories.filter(category=>!successfulCategories.has(category));save.metadata.calendar.generatedAt=result.generatedAt;save.metadata.calendar.partial=result.partial});onChanged();return result}
export function dismissCalendarSuggestion(id){update(save=>{save.preferences.calendar||={};save.preferences.calendar.dismissedSuggestions||=[];if(!save.preferences.calendar.dismissedSuggestions.includes(id))save.preferences.calendar.dismissedSuggestions.push(id);if(save.metadata.calendar?.suggestions)save.metadata.calendar.suggestions=save.metadata.calendar.suggestions.filter(item=>item.id!==id)})}
export async function addCalendarSuggestion(id,onChanged=()=>{}){const suggestion=(getState().metadata.calendar?.suggestions||[]).find(item=>item.id===id);if(!suggestion)throw new Error("Suggestion no longer available");const result=await post("/__vault/calendar/import-events","calendar-import-events",{events:[{title:suggestion.title,start:suggestion.startLocal,end:suggestion.endLocal,location:[suggestion.venue,suggestion.city].filter(Boolean).join(", "),description:suggestion.description,source:"vault-calendar-suggestion",sourceUrl:suggestion.sourceUrl}]});if(!result.created&&!result.skipped)throw new Error("Event was not added");update(save=>{save.preferences.calendar||={};save.preferences.calendar.addedSuggestions||=[];if(!save.preferences.calendar.addedSuggestions.includes(id))save.preferences.calendar.addedSuggestions.push(id);if(save.metadata.calendar?.suggestions)save.metadata.calendar.suggestions=save.metadata.calendar.suggestions.filter(item=>item.id!==id)});runtime.loadedKey="";await loadCalendar(onChanged,true);onChanged();return suggestion}

const localDate=value=>{const match=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})/);return match?`${match[1]}-${match[2]}-${match[3]}`:""};
const timeLabel=value=>{if(!String(value).includes("T"))return "ALL DAY";const date=new Date(value);return Number.isNaN(date.getTime())?"":date.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})};
// An event that runs across days belongs on every day it covers, not only the day
// it starts. Google gives an all-day event an exclusive end date, so the last day
// is trimmed back off.
export function eventsOnDay(key){
  return runtime.events.filter(event=>{
    const from=localDate(event.start);
    if(!from)return false;
    let to=localDate(event.end)||from;
    if(to>from&&!String(event.end||"").includes("T"))to=addDays(to,-1);
    if(to>from&&String(event.end||"").includes("T")&&new Date(event.end).getHours()===0&&new Date(event.end).getMinutes()===0)to=addDays(to,-1);
    return key>=from&&key<=to;
  }).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
}
const addDays=(key,amount)=>{const [year,month,day]=key.split("-").map(Number);const moved=new Date(year,month-1,day+amount);return dayKey(moved)};
const dayKey=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
// Today where you are. toISOString() is UTC, so from early evening onwards it named
// tomorrow — the month view highlighted the wrong cell and the agenda dropped today.
const todayKey=()=>dayKey(new Date());

function monthGrid(){const year=runtime.month.getFullYear(),month=runtime.month.getMonth(),first=new Date(year,month,1),start=new Date(year,month,1-first.getDay()),today=todayKey();return Array.from({length:42},(_,index)=>{const day=new Date(start);day.setDate(start.getDate()+index);const key=dayKey(day),events=eventsOnDay(key);return`<article class="calendar-day ${day.getMonth()===month?"":"outside"} ${key===today?"today":""}"><header><b>${day.getDate()}</b>${key===today?"<span>TODAY</span>":""}<button class="calendar-day-add" data-calendar-add-day="${key}" title="Add an event on this day" aria-label="Add an event on ${key}">+</button></header><div>${events.slice(0,4).map(event=>`<button class="calendar-event" data-calendar-open="${esc(event.id)}" title="${esc(event.title)} — click to edit"><time>${esc(timeLabel(event.start))}</time><span>${esc(event.title)}</span>${event.location?`<small>${esc(event.location)}</small>`:""}</button>`).join("")}${events.length>4?`<button class="calendar-more" data-calendar-day="${key}">+${events.length-4} MORE</button>`:""}</div></article>`}).join("")}
const categoryLabel={local:"LOCAL // REDFIELD AREA",within_3_hours:"WITHIN THREE HOURS",premiere:"MOVIES, SHOWS + OPENINGS"};
function suggestions(){const state=getState(),items=state.metadata.calendar?.suggestions||[],groups=["local","within_3_hours","premiere"];return groups.map(category=>{const cards=items.filter(item=>item.category===category).map(item=>`<article class="calendar-suggestion"><div><small>${esc(new Date(item.startLocal).toLocaleString([],{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}))}${item.distanceMiles?` · ${Number(item.distanceMiles)} MI`:""}</small><h3>${esc(item.title)}</h3><p>${esc(item.reason)}</p><span>${esc([item.venue,item.city].filter(Boolean).join(" · "))}</span></div><aside><button class="button primary" data-calendar-suggestion-add="${esc(item.id)}">ADD</button><button class="button" data-calendar-suggestion-remove="${esc(item.id)}">REMOVE</button>${item.sourceUrl?`<button class="button" data-calendar-link="${esc(item.sourceUrl)}">SOURCE</button>`:""}</aside></article>`).join("");return`<section class="calendar-suggestion-lane panel"><header><h2>${categoryLabel[category]}</h2><span>${items.filter(item=>item.category===category).length} READY</span></header><div>${cards||`<p class="calendar-empty">No current suggestions in this lane. Refresh whenever you want a new verified pass.</p>`}</div></section>`}).join("")}

// Adding an event of your own. The server route that writes to Google Calendar was
// already here — it was only ever reachable by accepting a Vault suggestion, so there
// was no way to put your own plans in the calendar.
const pad=value=>String(value).padStart(2,"0");
const todayValue=()=>{const now=new Date();return`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`};
const stamp=(date,time)=>`${date}T${time}:00`;
// A time typed here means that time where you are, so the browser's zone travels
// with the event. Without it the server guessed, and the guess was wrong.
const localZone=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||""}catch{return""}};

export async function createCalendarEvent({title,date,start,end,allDay=false,location="",description=""}){
  const clean=String(title||"").trim();
  if(!clean)throw new Error("Give the event a title.");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||"")))throw new Error("Choose a date.");
  // An all-day event is stored as the whole day, since the route takes exact times.
  const from=allDay?"00:00":String(start||"");
  const to=allDay?"23:59":String(end||"");
  if(!/^\d{2}:\d{2}$/.test(from)||!/^\d{2}:\d{2}$/.test(to))throw new Error("Choose a start and end time.");
  if(stamp(date,to)<=stamp(date,from))throw new Error("The end time has to come after the start time.");
  const result=await post("/__vault/calendar/import-events","calendar-import-events",{timeZone:localZone(),events:[{
    title:clean,start:stamp(date,from),end:stamp(date,to),
    location:String(location||"").trim(),description:String(description||"").trim(),
    source:"vault-calendar-manual"
  }]});
  if(!result.created&&!result.skipped)throw new Error("Google Calendar did not accept the event.");
  runtime.loadedKey="";           // force the month to reload so the event appears
  return{created:Number(result.created||0),skipped:Number(result.skipped||0)};
}

export async function updateCalendarEvent(eventId,{title,date,start,end,allDay=false,location="",description=""}){
  const clean=String(title||"").trim();
  if(!clean)throw new Error("Give the event a title.");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||"")))throw new Error("Choose a date.");
  const from=allDay?"00:00":String(start||"");
  const to=allDay?"23:59":String(end||"");
  if(!/^\d{2}:\d{2}$/.test(from)||!/^\d{2}:\d{2}$/.test(to))throw new Error("Choose a start and end time.");
  if(stamp(date,to)<=stamp(date,from))throw new Error("The end time has to come after the start time.");
  await post("/__vault/calendar/update-event","calendar-update-event",{
    eventId,title:clean,start:stamp(date,from),end:stamp(date,to),timeZone:localZone(),
    location:String(location||"").trim(),description:String(description||"").trim()
  });
  runtime.loadedKey="";
  return true;
}

export async function deleteCalendarEvent(eventId){
  const result=await post("/__vault/calendar/delete-event","calendar-delete-event",{eventId});
  runtime.loadedKey="";
  return Boolean(result.deleted);
}

// Opening an event inside the Vault rather than bouncing to Google. Saving or
// deleting here goes straight to the same calendar.
export function openCalendarEventEditor(eventId,onChanged=()=>{}){
  const event=runtime.events.find(entry=>entry.id===eventId);
  if(!event)return;
  const date=localDate(event.start)||todayValue();
  const clock=value=>{const parsed=new Date(value);return Number.isFinite(parsed.getTime())?`${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`:""};
  const from=clock(event.start)||"00:00",to=clock(event.end)||"23:59";
  const wholeDay=from==="00:00"&&(to==="23:59"||to==="00:00");
  openModal({
    title:"EDIT EVENT",
    body:`<div class="calendar-new-event"><p>Saving or deleting here changes your primary Google Calendar.</p>
      <label>WHAT<input data-ce-title value="${esc(event.title)}"></label>
      <label>DATE<input data-ce-date type="date" value="${esc(date)}"></label>
      <div class="calendar-new-times" ${wholeDay?"hidden":""}><label>FROM<input data-ce-start type="time" value="${esc(from)}"></label><label>TO<input data-ce-end type="time" value="${esc(to)}"></label></div>
      <label class="calendar-new-allday"><input data-ce-allday type="checkbox" ${wholeDay?"checked":""}> ALL DAY</label>
      <label>WHERE<input data-ce-location value="${esc(event.location||"")}"></label>
      <label>NOTES<textarea data-ce-description>${esc(event.description||"")}</textarea></label>
      ${event.htmlLink?`<a class="calendar-open-google" href="${esc(event.htmlLink)}" target="_blank" rel="noreferrer">OPEN IN GOOGLE CALENDAR ↗</a>`:""}</div>`,
    actions:[
      {label:"SAVE CHANGES",primary:true,handler:async dialog=>{
        const button=dialog.querySelector("button.primary");
        try{
          if(button){button.disabled=true;button.textContent="SAVING…"}
          await updateCalendarEvent(eventId,{
            title:dialog.querySelector("[data-ce-title]").value,
            date:dialog.querySelector("[data-ce-date]").value,
            start:dialog.querySelector("[data-ce-start]").value,
            end:dialog.querySelector("[data-ce-end]").value,
            allDay:dialog.querySelector("[data-ce-allday]").checked,
            location:dialog.querySelector("[data-ce-location]").value,
            description:dialog.querySelector("[data-ce-description]").value
          });
          closeModal();
          toast("EVENT UPDATED","Your Google Calendar has the change.");
          await loadCalendar(onChanged);onChanged();
        }catch(error){
          if(button){button.disabled=false;button.textContent="SAVE CHANGES"}
          toast("EVENT NOT UPDATED",error.message);
        }
      }},
      {label:"DELETE",handler:()=>{
        // A delete is asked twice, because it removes the event from the real calendar.
        openModal({title:"DELETE THIS EVENT?",body:`<p>${esc(event.title)} will be removed from your primary Google Calendar. Google keeps it in its own trash for a while.</p>`,actions:[
          {label:"DELETE FROM CALENDAR",primary:true,handler:async()=>{
            try{await deleteCalendarEvent(eventId);closeModal();toast("EVENT DELETED","It is gone from your Google Calendar.");await loadCalendar(onChanged);onChanged()}
            catch(error){toast("EVENT NOT DELETED",error.message)}
          }},
          {label:"KEEP IT",handler:()=>closeModal()}
        ]});
      }}
    ]
  });
  const root=document.querySelector("#modal-root .calendar-new-event");
  const allDay=root?.querySelector("[data-ce-allday]");
  if(allDay)allDay.onchange=()=>{const times=root.querySelector(".calendar-new-times");if(times)times.hidden=allDay.checked};
}

export function openCalendarEventDialog(onChanged=()=>{},day=""){
  const date=/^\d{4}-\d{2}-\d{2}$/.test(String(day||""))?day:todayValue();
  openModal({
    title:"ADD TO CALENDAR",
    body:`<div class="calendar-new-event"><p>This writes straight to your primary Google Calendar.</p>
      <label>WHAT<input data-ce-title autofocus placeholder="What is happening"></label>
      <label>DATE<input data-ce-date type="date" value="${date}"></label>
      <div class="calendar-new-times"><label>FROM<input data-ce-start type="time" value="18:00"></label><label>TO<input data-ce-end type="time" value="19:00"></label></div>
      <label class="calendar-new-allday"><input data-ce-allday type="checkbox"> ALL DAY</label>
      <label>WHERE<input data-ce-location placeholder="Optional"></label>
      <label>NOTES<textarea data-ce-description placeholder="Optional"></textarea></label></div>`,
    actions:[{label:"ADD EVENT",primary:true,handler:async dialog=>{
      const button=dialog.querySelector("button.primary")||null;
      const read=selector=>dialog.querySelector(selector);
      try{
        if(button){button.disabled=true;button.textContent="ADDING…"}
        const result=await createCalendarEvent({
          title:read("[data-ce-title]").value,
          date:read("[data-ce-date]").value,
          start:read("[data-ce-start]").value,
          end:read("[data-ce-end]").value,
          allDay:read("[data-ce-allday]").checked,
          location:read("[data-ce-location]").value,
          description:read("[data-ce-description]").value
        });
        closeModal();
        toast(result.created?"ADDED TO YOUR CALENDAR":"ALREADY ON YOUR CALENDAR",
          result.created?"It will show in the month view once it reloads.":"An identical event is already there.");
        await loadCalendar(onChanged);
        onChanged();
      }catch(error){
        if(button){button.disabled=false;button.textContent="ADD EVENT"}
        toast("EVENT NOT ADDED",error.message);
      }
    }}]
  });
  // All-day hides the time row rather than leaving two dead fields on screen.
  const root=document.querySelector("#modal-root .calendar-new-event");
  const allDay=root?.querySelector("[data-ce-allday]");
  if(allDay)allDay.onchange=()=>{const times=root.querySelector(".calendar-new-times");if(times)times.hidden=allDay.checked};
}

// Everything on one day, reachable from the day number or from "+N MORE" — the
// month cell only ever had room for four.
export function openCalendarDay(key,onChanged=()=>{}){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(key||"")))return;
  const [year,month,day]=key.split("-").map(Number);
  const when=new Date(year,month-1,day);
  const events=eventsOnDay(key);
  const body=`<div class="calendar-day-view">
    ${events.length?`<ol class="calendar-day-list">${events.map(event=>`<li><button data-calendar-open="${esc(event.id)}">
      <time>${esc(timeLabel(event.start))}${String(event.start||"").includes("T")&&String(event.end||"").includes("T")?` – ${esc(timeLabel(event.end))}`:""}</time>
      <b>${esc(event.title)}</b>
      ${event.location?`<small>${esc(event.location)}</small>`:""}
      ${event.description?`<p>${esc(String(event.description).slice(0,180))}</p>`:""}
    </button></li>`).join("")}</ol>`:`<p class="calendar-day-empty">Nothing on this day.</p>`}
    <button class="button primary" data-calendar-add-day="${key}">+ ADD ON THIS DAY</button>
  </div>`;
  openModal({title:when.toLocaleDateString([],{weekday:"long",month:"long",day:"numeric",year:"numeric"}).toUpperCase(),body,actions:[]});
}

// A plain list of what is coming, for when a grid is the wrong shape for the question.
function agendaView(){
  const today=todayKey();
  const upcoming=runtime.events
    .filter(event=>(localDate(event.end)||localDate(event.start))>=today)
    .sort((a,b)=>String(a.start).localeCompare(String(b.start)));
  if(!upcoming.length)return`<div class="empty"><b>NOTHING AHEAD THIS MONTH.</b>Use + ADD EVENT to put something in.</div>`;
  const byDay=new Map();
  for(const event of upcoming){const key=localDate(event.start);byDay.set(key,[...(byDay.get(key)||[]),event])}
  return`<div class="calendar-agenda">${[...byDay.entries()].map(([key,items])=>{
    const [year,month,day]=key.split("-").map(Number);
    const when=new Date(year,month-1,day);
    return`<section><header><b>${key===today?"TODAY":when.toLocaleDateString([],{weekday:"long"}).toUpperCase()}</b><span>${when.toLocaleDateString([],{month:"short",day:"numeric"})}</span><button data-calendar-add-day="${key}">+</button></header>
      <ol>${items.map(event=>`<li><button data-calendar-open="${esc(event.id)}"><time>${esc(timeLabel(event.start))}</time><b>${esc(event.title)}</b>${event.location?`<small>${esc(event.location)}</small>`:""}</button></li>`).join("")}</ol></section>`;
  }).join("")}</div>`;
}

export function setCalendarView(view){runtime.view=view==="agenda"?"agenda":"month";return true}

export function renderCalendarWing(){const state=getState(),generated=state.metadata.calendar?.generatedAt;const title=runtime.month.toLocaleDateString([],{month:"long",year:"numeric"});const content=`<div class="vault-calendar"><section class="calendar-command panel"><div><span class="eyebrow">GOOGLE CALENDAR // PRIMARY</span><h2>PERSONAL CALENDAR</h2><p>Your schedule stays separate from Vault recommendations. Nothing is added until you choose Add.</p></div><aside><button class="button primary" data-calendar-add>+ ADD EVENT</button><button class="button" data-calendar-today>TODAY</button><button class="button ${runtime.view!=="agenda"?"primary":""}" data-calendar-view="month">MONTH</button><button class="button ${runtime.view==="agenda"?"primary":""}" data-calendar-view="agenda">AGENDA</button><button class="button" data-calendar-refresh>REFRESH CALENDAR</button><button class="button" data-calendar-suggestions-refresh>FIND THINGS TO DO</button></aside></section><section class="calendar-month panel"><header><button class="button" data-calendar-month="-1">←</button><div><span class="eyebrow">MONTH VIEW</span><h2>${esc(title.toUpperCase())}</h2></div><button class="button" data-calendar-month="1">→</button></header>${runtime.view==="agenda"?`<div class="calendar-agenda-wrap">${runtime.loading?`<div class="calendar-loading">LOADING GOOGLE CALENDAR…</div>`:agendaView()}</div>`:`<div class="calendar-weekdays">${["SUN","MON","TUE","WED","THU","FRI","SAT"].map(day=>`<b>${day}</b>`).join("")}</div><div class="calendar-grid">${runtime.loading?`<div class="calendar-loading">LOADING GOOGLE CALENDAR…</div>`:monthGrid()}</div>`}${runtime.error?`<p class="calendar-error">${esc(runtime.error==="calendar_events_unavailable"?"Google Calendar could not be reached. Press REFRESH CALENDAR to try again.":runtime.error)}</p>`:""}</section><section class="calendar-discovery-heading"><div><span class="eyebrow">OPTIONAL // NOTHING ADDED AUTOMATICALLY</span><h2>CALENDAR SUGGESTIONS</h2><p>Built from your interests, centered on Redfield, and verified against current event sources.</p></div><small>${generated?`LAST SEARCH ${esc(new Date(generated).toLocaleString())}`:"RUN YOUR FIRST SEARCH"}</small></section>${suggestions()}</div>`;return renderAtomicWingShell({active:"calendar",title:"CALENDAR",section:"MONTH + SUGGESTIONS",content,footer:"CALENDAR // GOOGLE SCHEDULE + OPTIONAL DISCOVERY"})}
