import { createId } from "../core/ids.js";
import { getState, update } from "../core/store.js";
import { queueArtworkApproval } from "./artworkApproval.js";
import { fillTitlesFromFiles } from "./tvEpisodeDetails.js?v=20260911-episode-details-v1";

const normalize=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\b(?:the|a|an)\b/g," ").replace(/[^a-z0-9]+/g," ").trim();
const cleanTitle=value=>String(value||"").replace(/[<>]/g,"").replace(/\s+/g," ").trim().slice(0,160);

export async function scanAllMediaDrives(){
  const prior=getLastDriveScan(),known=(prior?.checkedGroups||prior?.groups||[]).map(group=>({groupId:group.groupId,kind:group.kind,title:group.title,confidence:group.confidence})).filter(group=>group.groupId&&group.kind&&group.kind!=="movie").slice(0,400);
  const response=await fetch("./__vault/media-scan",{method:"POST",headers:{"Content-Type":"application/json","X-Vault-Request":"scan-all-media"},body:JSON.stringify({known})});
  const report=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(report.error==="ai_rate_limited"?"AI identification is busy. Try the scan again shortly.":"The two-drive media scan could not finish.");
  await globalThis.__vaultActiveJobControl?.checkpoint?.();
  let tvAdded=0,tvUpdated=0,moviesAdded=0,review=0,tvFound=[],movieFound=[],movieArtwork=[];
  update(save=>{
    const previousReview=new Map((save.metadata?.fullDriveScan?.uncertain||[]).map(entry=>[entry.groupId,entry]));
    const tvByTitle=new Map(Object.values(save.items||{}).filter(item=>item.wing==="tv").map(item=>[normalize(item.title),item]));
    const movieByTitle=new Map(Object.values(save.items||{}).filter(item=>item.wing==="movies").map(item=>[normalize(item.title),item]));
    const movieCollection=save.collections.collection_drive_scan_movies||={id:"collection_drive_scan_movies",wing:"movies",title:"FOUND ON C & D DRIVES",itemIds:[],legacy:{category:"DRIVE SCAN"},createdAt:report.scannedAt};
    const uncertain=[];
    for(const group of report.groups||[]){
      const title=cleanTitle(group.title||group.titleHint);if(!title)continue;
      if(group.confidence==="low"||group.kind==="unknown"){
        if(!group.reviewEligible)continue;
        const previous=previousReview.get(group.groupId);
        const record={...previous,groupId:group.groupId,title,kindHint:group.kindHint,files:group.files||[],status:previous?.status||"pending"};
        uncertain.push(record);if(record.status==="pending")review++;continue
      }
      if(group.kind==="tv"){
        // A season folder, a single episode, or a DVD extra has no numbered episodes.
        // Never create a series record from those; send them to review instead.
        const numbered=(group.files||[]).filter(file=>file.season&&file.episode);
        if(!numbered.length){
          const previous=previousReview.get(group.groupId);
          const record={...previous,groupId:group.groupId,title,kindHint:group.kindHint,files:group.files||[],status:previous?.status||"pending",reason:"no_numbered_episodes"};
          uncertain.push(record);if(record.status==="pending")review++;continue;
        }
        tvFound.push(title);
        let item=tvByTitle.get(normalize(title));
        if(!item){const id=createId("tv_scan");item=save.items[id]={id,wing:"tv",type:"tv",title,status:"backlog",owned:true,favorite:false,genres:["Television"],artwork:"",addedAt:report.scannedAt,episodes:{},sourcePaths:[],scanSource:"C & D AI scan"};tvByTitle.set(normalize(title),item);tvAdded++}else tvUpdated++;
        item.owned=true;item.episodes||={};item.sourcePaths||=[];
        for(const file of group.files||[]){if(!file.season||!file.episode)continue;const code=`s${String(file.season).padStart(2,"0")}e${String(file.episode).padStart(2,"0")}`,id=`${item.id}_${code}`;const prior=item.episodes[id]||{};item.episodes[id]={...prior,id,season:Number(file.season),number:Number(file.episode),status:prior.status||"backlog",sourcePath:file.path};if(!item.sourcePaths.includes(file.path))item.sourcePaths.push(file.path)}
        const episodes=Object.values(item.episodes);item.progress={completed:episodes.filter(episode=>episode.status==="completed").length,total:episodes.length};
      }else if(group.kind==="movie"&&group.confidence==="high"&&(group.files||[]).length){
        movieFound.push(title);
        let item=movieByTitle.get(normalize(title));
        if(!item){const id=createId("movie_scan");item=save.items[id]={id,wing:"movies",type:"movie",title,status:"backlog",owned:true,favorite:false,genres:["Drive Scan"],artwork:"",addedAt:report.scannedAt,sourcePaths:[],scanSource:"C & D AI scan"};movieByTitle.set(normalize(title),item);movieCollection.itemIds.push(id);moviesAdded++}
        item.owned=true;item.sourcePaths=[...new Set([...(item.sourcePaths||[]),...(group.files||[]).map(file=>file.path)])];
        const metadata=group.movieMetadata;if(metadata){item.title=metadata.title||item.title;item.year=metadata.year||item.year;item.runtime=metadata.runtimeMinutes||item.runtime;item.genres=(metadata.genres||[]).length?metadata.genres:item.genres;item.description=metadata.description||item.description||"";item.creator=(metadata.directors||[]).join(", ")||item.creator||"";item.studio=metadata.studio||item.studio||"";item.movieMeta={...(item.movieMeta||{}),tmdbId:metadata.tmdbId||"",collectionId:metadata.collectionId||"",collectionName:metadata.collectionName||"",collectionPosterImageUrl:metadata.collectionPosterImageUrl||"",directors:metadata.directors||[],cast:metadata.cast||[],externalId:metadata.externalId||"",sourceName:"TMDB",sourceUrl:metadata.sourceUrl||"",catalogCheckedAt:report.scannedAt};if(metadata.posterImageUrl&&!item.artwork)movieArtwork.push({itemId:item.id,title:item.title,year:item.year,path:metadata.posterImageUrl,sourceUrl:metadata.posterSourceUrl||metadata.sourceUrl||""})}
        if(!movieCollection.itemIds.includes(item.id))movieCollection.itemIds.push(item.id);
      }else{
        const previous=previousReview.get(group.groupId);
        const record={...previous,groupId:group.groupId,title,kindHint:group.kindHint,files:group.files||[],status:previous?.status||"pending",reason:"movie_identity_not_verified"};
        uncertain.push(record);if(record.status==="pending")review++;
      }
    }
    save.metadata.fullDriveScan={reviewPolicy:"tmdb90-v1",scannedAt:report.scannedAt,drives:report.drives,fileCount:report.fileCount,groupCount:(report.groups||[]).length,tvAdded,tvUpdated,moviesAdded,review,excluded:Number(report.excluded||0),aiUsed:Boolean(report.aiUsed),tmdbUsed:Boolean(report.tmdbUsed),reusedChecks:Number(report.reusedChecks||0),newChecks:Number(report.newChecks||0),checkedGroups:(report.groups||[]).map(group=>({groupId:group.groupId,kind:group.kind,title:group.title,confidence:group.confidence})),tvFound:[...new Set(tvFound)].slice(0,100),movieFound:[...new Set(movieFound)].slice(0,100),uncertain};
  });
  for(const artwork of movieArtwork)queueArtworkApproval({kind:"movie",itemId:artwork.itemId,key:`movie:${artwork.itemId}:main`,title:artwork.title,subtitle:`${artwork.year||"Year unknown"} TMDB poster`,path:artwork.path,sourceName:"TMDB",sourceUrl:artwork.sourceUrl});
  // Newly linked episodes take their title from the filename straight away.
  const titlesFilled=fillTitlesFromFiles();
  return{...report,tvAdded,tvUpdated,moviesAdded,review,titlesFilled,tvFound:[...new Set(tvFound)],movieFound:[...new Set(movieFound)]};
}

export const getLastDriveScan=()=>{const report=getState().metadata?.fullDriveScan||null;if(!report||report.reviewPolicy==="tmdb90-v1")return report;return{...report,review:0,uncertain:[]}};

export function ignoreAllPendingDriveScan(){let count=0;update(save=>{const report=save.metadata?.fullDriveScan;if(!report)return;for(const record of report.uncertain||[]){if(record.status!=="pending")continue;record.status="ignored";record.resolvedAs="ignore";record.resolvedAt=new Date().toISOString();record.canUndo=true;count++}report.review=0});return count}

export function resolveDriveScanReview(groupId,decision){
  let resolvedTitle="";
  update(save=>{
    const report=save.metadata?.fullDriveScan,record=report?.uncertain?.find(entry=>entry.groupId===groupId);if(!record||decision!=="undo"&&record.status!=="pending"||decision==="undo"&&!record.canUndo)return;
    resolvedTitle=record.title;
    if(decision==="undo"&&record.canUndo){
      const item=save.items?.[record.itemId];
      if(item){for(const id of record.addedEpisodeIds||[])delete item.episodes?.[id];item.sourcePaths=(item.sourcePaths||[]).filter(path=>!(record.addedPaths||[]).includes(path));if(item.episodes){const episodes=Object.values(item.episodes);item.progress={completed:episodes.filter(episode=>episode.status==="completed").length,total:episodes.length}}if(record.createdItem&&!item.sourcePaths?.length&&!Object.keys(item.episodes||{}).length){delete save.items[item.id];for(const collection of Object.values(save.collections||{}))collection.itemIds=(collection.itemIds||[]).filter(id=>id!==item.id)}}
      record.status="pending";delete record.resolvedAs;delete record.resolvedAt;delete record.itemId;delete record.createdItem;delete record.addedEpisodeIds;delete record.addedPaths;delete record.canUndo;report.review=report.uncertain.filter(entry=>entry.status==="pending").length;return;
    }
    record.status=decision==="ignore"?"ignored":"accepted";record.resolvedAs=decision;record.resolvedAt=new Date().toISOString();if(decision==="ignore")record.canUndo=true;
    if(decision==="tv"){
      const existing=Object.values(save.items||{}).find(item=>item.wing==="tv"&&normalize(item.title)===normalize(record.title)),createdItem=!existing;const item=existing||(()=>{const id=createId("tv_scan");return save.items[id]={id,wing:"tv",type:"tv",title:record.title,status:"backlog",owned:true,favorite:false,genres:["Television"],artwork:"",addedAt:record.resolvedAt,episodes:{},sourcePaths:[],scanSource:"C & D scan review"}})();item.episodes||={};item.sourcePaths||=[];const addedEpisodeIds=[],addedPaths=[];for(const file of record.files||[]){if(!file.season||!file.episode)continue;const id=`${item.id}_s${String(file.season).padStart(2,"0")}e${String(file.episode).padStart(2,"0")}`,prior=item.episodes[id]||{};if(!item.episodes[id])addedEpisodeIds.push(id);item.episodes[id]={...prior,id,season:Number(file.season),number:Number(file.episode),status:prior.status||"backlog",sourcePath:file.path};if(!item.sourcePaths.includes(file.path)){item.sourcePaths.push(file.path);addedPaths.push(file.path)}}const episodes=Object.values(item.episodes);item.progress={completed:episodes.filter(episode=>episode.status==="completed").length,total:episodes.length};Object.assign(record,{itemId:item.id,createdItem,addedEpisodeIds,addedPaths,canUndo:true});report.tvFound=[...new Set([...(report.tvFound||[]),record.title])];if(createdItem)report.tvAdded=Number(report.tvAdded||0)+1;
    }else if(decision==="movie"){
      const collection=save.collections.collection_drive_scan_movies||={id:"collection_drive_scan_movies",wing:"movies",title:"FOUND ON C & D DRIVES",itemIds:[],legacy:{category:"DRIVE SCAN"},createdAt:record.resolvedAt};let item=Object.values(save.items||{}).find(entry=>entry.wing==="movies"&&normalize(entry.title)===normalize(record.title)),createdItem=!item;if(!item){const id=createId("movie_scan");item=save.items[id]={id,wing:"movies",type:"movie",title:record.title,status:"backlog",owned:true,favorite:false,genres:["Drive Scan"],artwork:"",addedAt:record.resolvedAt,sourcePaths:[],scanSource:"C & D scan review"}}const addedPaths=(record.files||[]).map(file=>file.path).filter(path=>!item.sourcePaths?.includes(path));item.sourcePaths=[...new Set([...(item.sourcePaths||[]),...addedPaths])];if(!collection.itemIds.includes(item.id))collection.itemIds.push(item.id);Object.assign(record,{itemId:item.id,createdItem,addedPaths,addedEpisodeIds:[],canUndo:true});report.movieFound=[...new Set([...(report.movieFound||[]),record.title])];if(createdItem)report.moviesAdded=Number(report.moviesAdded||0)+1;
    }
    report.review=report.uncertain.filter(entry=>entry.status==="pending").length;
  });
  if(decision==="tv")fillTitlesFromFiles();
  return resolvedTitle;
}
