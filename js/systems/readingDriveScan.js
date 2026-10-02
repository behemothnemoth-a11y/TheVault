import { createId } from "../core/ids.js";
import { getState, update } from "../core/store.js";

const fileFingerprint=file=>`${Number(file?.bytes||0)}:${String(file?.lastWriteUtc||"")}`;
function mergeScannedFile(incoming,known,selection={}){if(!known)return{...incoming,...selection};const unchanged=fileFingerprint(incoming)===fileFingerprint(known);if(unchanged)return{...incoming,...known,...selection,path:incoming.path,name:incoming.name,extension:incoming.extension,bytes:incoming.bytes,lastWriteUtc:incoming.lastWriteUtc,titleHint:known.titleHint||incoming.titleHint};return{...incoming,...selection,status:"pending",metadataChanged:true,previousFingerprint:fileFingerprint(known),previousItemId:known.itemId||"",titleHint:incoming.titleHint,changedAt:new Date().toISOString()}}

export async function scanSelectedReadingFolder(wing,{onProgress=()=>{},path=""}={}){
  const response=await fetch("./__vault/folder-scan",{method:"POST",headers:{"Content-Type":"application/json","X-Vault-Request":"scan-selected-folder"},body:JSON.stringify({wing,path})}),payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error("The selected folder could not be scanned.");if(payload.cancelled)return payload;
  await globalThis.__vaultActiveJobControl?.checkpoint?.();
  let added=0,remembered=0,changed=0;
  update(save=>{const current=save.metadata.readingDriveScan||{scanned:true,readOnly:true,files:[]},existing=new Map((current.files||[]).map(file=>[file.id,file])),selected=[];for(const incoming of payload.files||[]){const prior=existing.get(incoming.id);existing.delete(incoming.id);const entry=mergeScannedFile(incoming,prior,{selectedFolder:payload.folder,selectedAt:payload.scannedAt});selected.push(entry);if(!prior)added++;else if(entry.metadataChanged)changed++;else remembered++}current.files=[...selected,...existing.values()];current.fileCount=current.files.length;current.scannedAt=payload.scannedAt;current.lastSelectedFolder=payload.folder;current.lastSelectedCount=selected.length;current.changed=changed;current.remembered=remembered;current.added=added;save.metadata.readingDriveScan=current});
  const automatic=await autoImportReadingFiles({folder:payload.folder,wing,onProgress});return{...payload,added,remembered,changed,automatic};
}
export const getReadingDriveScan=()=>getState().metadata?.readingDriveScan||null;
export function ignoreAllPendingReadingFiles(folder=""){let count=0;const scope=String(folder||"").toLowerCase();update(save=>{const scan=save.metadata?.readingDriveScan;if(!scan)return;for(const file of scan.files||[]){if(file.status!=="pending"||(scope&&String(file.selectedFolder||"").toLowerCase()!==scope))continue;file.status="ignored";file.resolvedAs="ignore";file.resolvedAt=new Date().toISOString();count++}});return count}
export async function identifyPendingReadingFiles({limit=60,folder="",onProgress=()=>{}}={}){const scope=String(folder||"").toLowerCase(),scan=getReadingDriveScan(),files=(scan?.files||[]).filter(file=>file.status==="pending"&&!file.aiIdentifiedAt&&(!scope||String(file.selectedFolder||"").toLowerCase()===scope)).slice(0,limit);if(!files.length)return{identified:0,remaining:0};onProgress({current:0,total:files.length,phase:"SENDING SELECTED FILE PATHS…"});const response=await fetch("./__vault/reading/identify",{method:"POST",headers:{"Content-Type":"application/json","X-Vault-Request":"identify-reading-files"},body:JSON.stringify({files:files.map(file=>({fileId:file.id,titleHint:file.titleHint,extension:file.extension,path:file.path}))})}),payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(response.status===429?"Reading-file identification is busy. Try again shortly.":"Reading-file identification is unavailable.");const byId=new Map((payload.results||[]).map(result=>[result.fileId,result]));let identified=0;update(save=>{for(const file of save.metadata.readingDriveScan?.files||[]){const result=byId.get(file.id);if(!result)continue;file.titleHint=result.title||file.titleHint;file.aiKind=result.kind;file.aiConfidence=result.confidence;file.aiReason=result.reason;file.aiIdentifiedAt=payload.identifiedAt||new Date().toISOString();if(result.confidence!=="low"&&["book","comic"].includes(result.kind))file.kind=result.kind;identified++}});onProgress({current:files.length,total:files.length,phase:"IDENTIFICATION COMPLETE"});const remaining=(getReadingDriveScan()?.files||[]).filter(file=>file.status==="pending"&&!file.aiIdentifiedAt&&(!scope||String(file.selectedFolder||"").toLowerCase()===scope)).length;return{identified,remaining}}
export async function inspectReadingFile(fileId,{force=false}={}){const file=getReadingDriveScan()?.files?.find(entry=>entry.id===fileId);if(!file)return{};if(!force&&file.metadataInspectedAt&&file.localMetadata)return file.localMetadata;try{const response=await fetch("./__vault/reading/metadata",{method:"POST",headers:{"Content-Type":"application/json","X-Vault-Request":"reading-metadata"},body:JSON.stringify({path:file.path})}),payload=await response.json().catch(()=>({}));if(!response.ok)return{};update(save=>{const target=save.metadata.readingDriveScan?.files?.find(entry=>entry.id===fileId);if(target){target.localMetadata=payload;target.metadataInspectedAt=new Date().toISOString();if(payload.title)target.titleHint=payload.seriesName||payload.title}});return payload}catch{return{}}}
const comicExtensions=new Set(["CBZ","CBR","CB7","CBT"]),bookExtensions=new Set(["EPUB","MOBI","AZW","AZW3","FB2","TXT","RTF","HTML","HTM","MD","DJVU","XPS"]);
function automaticKind(file,metadata,wing=""){
  if(wing==="books")return"book";
  if(wing==="manga")return"comic";
  const extension=String(file.extension||"").toUpperCase();
  if(comicExtensions.has(extension))return"comic";
  if(bookExtensions.has(extension))return"book";
  if(extension==="PDF"){
    const path=String(file.path||"").toLowerCase();
    if(/(?:comic|manga|graphic novel|issue|volume|vol\.?\s*\d)/i.test(path))return"comic";
    if(/(?:book|ebook|novel|author|library|kindle)/i.test(path))return"book";
  }
  if(["book","comic"].includes(metadata?.kind)&&metadata?.confidence!=="low")return metadata.kind;
  if(["book","comic"].includes(file.aiKind)&&file.aiConfidence!=="low")return file.aiKind;
  return"review";
}
export async function autoImportReadingFiles({folder="",wing="",onProgress=()=>{}}={}){
  const scope=String(folder||"").toLowerCase(),files=(getReadingDriveScan()?.files||[]).filter(file=>file.status==="pending"&&(!scope||String(file.selectedFolder||"").toLowerCase()===scope));
  const result={total:files.length,added:0,books:0,comics:0,grouped:0,merged:0,duplicates:0,review:0,failed:0,itemIds:[]};
  for(let index=0;index<files.length;index++){
    await globalThis.__vaultActiveJobControl?.checkpoint?.();
    const file=files[index];onProgress({current:index,total:files.length,phase:"READING EMBEDDED METADATA…",detail:file.name||file.titleHint||"FILE"});
    try{
      const metadata=await inspectReadingFile(file.id),decision=automaticKind(file,metadata,wing);onProgress({current:index,total:files.length,phase:"MATCHING EXISTING LIBRARY…",detail:metadata.title||file.titleHint||file.name});
      if(decision==="review"||!String(metadata.title||file.titleHint||"").trim()){result.review++;continue}
      const resolved=resolveReadingFile(file.id,decision,metadata);if(!resolved.itemId){result.failed++;continue}
      const latest=getReadingDriveScan()?.files?.find(entry=>entry.id===file.id);if(latest?.status==="duplicate")result.duplicates++;else if(latest?.status==="merged")result.merged++;else{result.added++;result[decision==="book"?"books":"comics"]++;if(resolved.grouped)result.grouped++;result.itemIds.push(resolved.itemId)}
    }catch(error){if(error?.code==="VAULT_JOB_CANCELLED")throw error;result.failed++}
  }
  result.review=(getReadingDriveScan()?.files||[]).filter(file=>file.status==="pending"&&(!scope||String(file.selectedFolder||"").toLowerCase()===scope)).length;
  update(save=>{const scan=save.metadata?.readingDriveScan;if(scan)scan.lastAutomaticImport={...result,folder:String(folder||""),wing:String(wing||""),completedAt:new Date().toISOString()}});
  onProgress({current:files.length,total:files.length,phase:"AUTOMATIC IMPORT COMPLETE",detail:`${result.added} added · ${result.review} need review`});return result;
}
const identity=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
// Copies of one book in different formats share a filename, not metadata: only an
// EPUB carries package details, so a .mobi's title is whatever the file is called.
// The stem is what ties "Chainfire - Terry Goodkind.epub/.azw3/.mobi" together.
export function stemKey(path){return String(path||"").split(/[\\/]/).pop().replace(/\.[^.]+$/,"").toLowerCase().replace(/\((?:v[\d.]+|epub|mobi|azw3?|retail|z-?lib[^)]*)\)/g," ").replace(/\b(?:epub|mobi|azw3?|retail|calibre)\b/g," ").replace(/^\s*\d{1,3}[\s._-]+/," ").replace(/[^a-z0-9]+/g," ").trim()}
const sameWork=(item,file)=>{const key=stemKey(file.path);if(!key)return false;if(stemKey(item.sourcePath)===key)return true;return (item.bookMeta?.localFiles||[]).some(entry=>stemKey(entry.path)===key)};
export function resolveReadingFile(fileId,decision,metadata={}){
  let title="",itemId="",grouped=false;
  update(save=>{
    const scan=save.metadata.readingDriveScan,file=scan?.files?.find(entry=>entry.id===fileId);if(!file)return;
    const details=Object.keys(metadata||{}).length?metadata:file.localMetadata||{};title=details.seriesName||details.title||file.titleHint;
    if(decision==="undo"&&file.status==="ignored"){file.status="pending";file.resolvedAs="";file.resolvedAt="";return}
    if(file.status!=="pending")return;
    file.status=decision==="ignore"?"ignored":"added";file.resolvedAs=decision;file.resolvedAt=new Date().toISOString();if(decision==="ignore")return;
    const normalizedPath=String(file.path||"").toLowerCase(),existingPath=Object.values(save.items||{}).find(item=>(item.sourcePath&&String(item.sourcePath).toLowerCase()===normalizedPath)||item.comicMeta?.volumes?.some(volume=>String(volume.sourcePath||"").toLowerCase()===normalizedPath)||item.bookMeta?.localFiles?.some(entry=>String(entry.path||"").toLowerCase()===normalizedPath));
    if(existingPath){file.itemId=existingPath.id;itemId=existingPath.id;if(file.metadataChanged){const editable=existingPath.bookMeta||existingPath.comicMeta;if(editable&&!editable.identityEditedAt){if(details.title)existingPath.title=details.seriesName||details.title;if(details.authors?.length){existingPath.authors=details.authors;existingPath.creator=details.authors.join(", ")}existingPath.publisher=details.publisher||existingPath.publisher;existingPath.year=Number(details.year)||existingPath.year;existingPath.description=details.description||existingPath.description;editable.localMetadataSource=details.metadataSource||editable.localMetadataSource;editable.metadataStatus=details.confidence||editable.metadataStatus;editable.metadataCheckedAt=new Date().toISOString()}file.status="merged"}else file.status="duplicate";delete file.metadataChanged;return}
    const addedAt=new Date().toISOString();
    if(decision==="book"){
      const series=String(details.seriesName||"").trim(),bookTitle=String(details.title||file.titleHint||"").trim(),authors=Array.isArray(details.authors)?details.authors:[],isbn=String(details.isbn||"").replace(/[^0-9Xx]/g,"").toLowerCase(),existingBook=Object.values(save.items||{}).find(item=>item.wing==="books"&&item.bookMeta&&((isbn&&String(item.bookMeta.isbn||"").replace(/[^0-9Xx]/g,"").toLowerCase()===isbn)||(identity(item.title)===identity(bookTitle)&&identity((item.authors||[])[0])===identity(authors[0]))||sameWork(item,file)));
      if(existingBook){existingBook.owned=true;existingBook.sourcePath||=file.path;existingBook.bookMeta.sourcePath||=file.path;existingBook.bookMeta.fileFormat||=file.extension;existingBook.bookMeta.pageCount=Math.max(Number(existingBook.bookMeta.pageCount||0),Number(details.pageCount||0));existingBook.bookMeta.localFiles||=[];if(!existingBook.bookMeta.localFiles.some(entry=>String(entry.path).toLowerCase()===String(file.path).toLowerCase()))existingBook.bookMeta.localFiles.push({path:file.path,format:file.extension,bytes:Number(file.bytes||0),lastWriteUtc:file.lastWriteUtc||""});file.itemId=existingBook.id;itemId=existingBook.id;file.status="merged";grouped=true;return}
      const id=createId("book_file");save.items[id]={id,wing:"books",type:"book",title:bookTitle,authors,publisher:details.publisher||"",year:Number(details.year)||null,genres:Array.isArray(details.genres)?details.genres:[],description:details.description||"",format:file.extension,artwork:"",owned:true,favorite:false,addedAt,sourcePath:file.path,bookMeta:{curated:true,status:"planned",pageCount:Number(details.pageCount)||0,currentPage:0,percent:0,kindleOwned:false,audibleOwned:false,notes:"",isbn:details.isbn||"",seriesName:series,seriesPosition:details.seriesPosition,seriesConfidence:series?details.confidence||"medium":"",fileFormat:file.extension,sourcePath:file.path,localFiles:[{path:file.path,format:file.extension,bytes:Number(file.bytes||0),lastWriteUtc:file.lastWriteUtc||""}],readerProgress:0,addedFromDriveScan:true,localMetadataSource:details.metadataSource||"filename",metadataStatus:details.confidence||"local",addedAt}};file.itemId=id;itemId=id;return;
    }
    if(decision!=="comic")return;
    const seriesTitle=String(details.seriesName||details.title||file.titleHint).trim(),existingSeries=Object.values(save.items||{}).find(item=>item.wing==="manga"&&item.comicMeta&&identity(item.title)===identity(seriesTitle)),volumes=existingSeries?.comicMeta?.volumes||[],rawPosition=details.seriesPosition,parsedPosition=rawPosition===null||rawPosition===undefined||rawPosition===""?NaN:Number(rawPosition),usedNumbers=new Set(volumes.map(entry=>Number(entry.number)).filter(Number.isFinite));
    let volumeNumber=Number.isFinite(parsedPosition)?parsedPosition:1;while(usedNumbers.has(volumeNumber))volumeNumber++;
    const volume={number:volumeNumber,title:details.title&&identity(details.title)!==identity(seriesTitle)?details.title:`Volume ${volumeNumber}`,sourcePath:file.path,fileFormat:file.extension,pageCount:Number(details.pageCount)||0,bytes:Number(file.bytes||0),lastWriteUtc:file.lastWriteUtc||"",owned:true,read:false,metadataSource:details.metadataSource||"filename"};
    if(existingSeries){existingSeries.comicMeta.volumes||=[];existingSeries.comicMeta.volumes.push(volume);existingSeries.comicMeta.volumes.sort((a,b)=>Number(a.number)-Number(b.number));existingSeries.comicMeta.latestKnown=Math.max(Number(existingSeries.comicMeta.latestKnown||0),volumeNumber);existingSeries.owned=true;file.itemId=existingSeries.id;itemId=existingSeries.id;grouped=true;return}
    const id=createId("comic_file");save.items[id]={id,wing:"manga",type:"comic",title:seriesTitle,creator:(details.authors||[]).join(", "),publisher:details.publisher||"",year:Number(details.year)||null,genres:[...new Set(["Comics",...(details.genres||[])])].slice(0,8),description:details.description||"",artwork:"",owned:true,favorite:false,addedAt,sourcePath:file.path,comicMeta:{format:"comic",readingStatus:"planned",publicationStatus:"unknown",progressUnit:"volumes",readThrough:0,latestKnown:volumeNumber,releaseLane:"manual",monitoring:false,hidden:false,releases:[],volumes:[volume],sourcePath:file.path,fileFormat:file.extension,readerProgress:0,addedFromDriveScan:true,localMetadataSource:details.metadataSource||"filename",readingAccess:{preferred:"local",webUrl:"",kindleOwned:false,kindleUrl:""}}};file.itemId=id;itemId=id;
  });return{title,itemId,grouped};
}
