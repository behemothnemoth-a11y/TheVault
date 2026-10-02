import { createId } from "../core/ids.js";
import { getState, update } from "../core/store.js";

export function queueArtworkApproval(candidate){
  const path=String(candidate.path||"");if(!path)return"";
  let id="";update(save=>{save.metadata.artworkApprovals||=[];const key=String(candidate.key||`${candidate.kind}:${candidate.itemId}:${candidate.target||"main"}`),rejected=save.metadata.artworkApprovals.find(entry=>entry.key===key&&entry.path===path&&entry.status==="rejected");if(rejected)return;const pending=save.metadata.artworkApprovals.find(entry=>entry.key===key&&entry.status==="pending");if(pending){Object.assign(pending,candidate,{key,path,updatedAt:new Date().toISOString()});id=pending.id;return}id=createId("art_review");save.metadata.artworkApprovals.push({id,key,path,kind:String(candidate.kind||"item"),itemId:String(candidate.itemId||""),target:String(candidate.target||"main"),title:String(candidate.title||"Artwork candidate"),subtitle:String(candidate.subtitle||""),sourceName:String(candidate.sourceName||"Source unavailable"),sourceUrl:String(candidate.sourceUrl||""),status:"pending",createdAt:new Date().toISOString()})});return id;
}

export const pendingArtworkApprovals=()=>[...(getState().metadata?.artworkApprovals||[])].filter(entry=>entry.status==="pending");

function applyApprovedArtwork(save,entry){
  if(entry.kind==="music_album_catalog"){const albums=save.metadata?.music?.expandedCatalog?.[entry.itemId]?.albums||[],album=albums.find(record=>String(record.spotifyId)===String(entry.target));if(album){album.artwork=entry.path;album.artworkApprovedAt=entry.resolvedAt}return}
  if(entry.kind==="music_album"){for(const item of Object.values(save.items||{})){if(item.wing!=="music")continue;const target=`${String(item.creator||item.artist||"").trim().toLowerCase()}::${String(item.series||item.album||"Singles & Loose Tracks").trim().toLowerCase()}`;if(target!==entry.target)continue;item.artwork=entry.path;item.musicMeta={...(item.musicMeta||{}),artworkApprovedAt:entry.resolvedAt,artworkSourceName:entry.sourceName,artworkSourceUrl:entry.sourceUrl}}return}
  const item=save.items?.[entry.itemId];if(!item)return;
  if(entry.kind==="tv_season"){item.seasonArtwork||={};item.seasonArtwork[String(entry.target)]=entry.path;item.seasonArtworkSources||={};item.seasonArtworkSources[String(entry.target)]={name:entry.sourceName,url:entry.sourceUrl,approvedAt:entry.resolvedAt}}
  else if(entry.kind==="comic_volume"){const volume=item.comicMeta?.volumes?.find(record=>String(record.number)===String(entry.target));if(volume)volume.artwork=entry.path}
  else{item.artwork=entry.path;if(entry.kind==="youtube")item.youtubeMeta.discoveredArtwork=entry.path;if(entry.kind==="comic"){item.comicMeta.artworkCredit=entry.sourceName;item.comicMeta.artworkKind="published";item.comicMeta.artworkAddedAt=entry.resolvedAt}}
}

export function resolveArtworkApproval(id,approved){let title="";update(save=>{const entry=save.metadata?.artworkApprovals?.find(record=>record.id===id);if(!entry||entry.status!=="pending")return;title=entry.title;entry.status=approved?"approved":"rejected";entry.resolvedAt=new Date().toISOString();if(approved)applyApprovedArtwork(save,entry)});return title}

export function verifyAllPendingArtwork(ids=[]){
  const selected=new Set(ids.map(String));let verified=0;
  update(save=>{const resolvedAt=new Date().toISOString();for(const entry of save.metadata?.artworkApprovals||[]){if(entry.status!=="pending"||(selected.size&&!selected.has(String(entry.id))))continue;entry.status="approved";entry.resolvedAt=resolvedAt;applyApprovedArtwork(save,entry);verified++}});
  return verified;
}

export function artworkApprovalStats(){const entries=getState().metadata?.artworkApprovals||[];return{pending:entries.filter(entry=>entry.status==="pending").length,approved:entries.filter(entry=>entry.status==="approved").length,rejected:entries.filter(entry=>entry.status==="rejected").length}}
