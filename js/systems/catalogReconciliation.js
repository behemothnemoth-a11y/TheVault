import { getState, update } from "../core/store.js";
export function normalizeCatalogTitle(value){return String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/&/g," and ").replace(/\b(?:the|a|an)\b/g," ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}
const pathFor=file=>file.sourcePath||(/^[a-z]:\\/i.test(file.path)?file.path:`D:\\TV Shows\\${file.path}`);
const epKey=file=>file.season&&file.episode?`${+file.season}:${+file.episode}`:null;
const quality=path=>{const text=String(path).toLowerCase();const resolution=text.match(/(?:^|[.\s_-])(2160|1080|720|576|480)p?(?:[.\s_-]|$)/);const pixels=resolution?+resolution[1]:0;const format=/\.mkv$/i.test(text)?3:/\.mp4$/i.test(text)?2:1;return pixels*10+format};
export function reconcileAcceptedDriveScans(){
  const state=getState();if(!state)return null;
  const accepted=(state.metadata.driveReviewQueue||[]).filter(c=>c.status==="accepted");if(!accepted.length)return null;
  const report={matched:0,ambiguous:0,pathsLinked:0,upgrades:0,duplicates:[],unmatched:[]};
  update(save=>{
    const shows=Object.values(save.items).filter(i=>i.wing==="tv"&&!i.id.startsWith("tv_drive_"));
    const owners=new Map();for(const show of shows)for(const ep of Object.values(show.episodes||{}))if(ep.sourcePath)owners.set(ep.sourcePath.toLowerCase(),`${show.id}:${ep.id}`);
    for(const candidate of accepted){
      const matches=shows.filter(show=>normalizeCatalogTitle(show.title)===normalizeCatalogTitle(candidate.title));
      if(matches.length!==1){candidate.reconciliation={status:matches.length?"ambiguous":"unmatched",checkedAt:new Date().toISOString()};if(matches.length)report.ambiguous++;else report.unmatched.push(candidate.title);continue}
      const show=matches[0];show.owned=true;show.episodes||={};
      const byEpisode=new Map(Object.values(show.episodes).map(ep=>[`${+ep.season}:${+ep.number}`,ep]));
      for(const file of candidate.files||[]){
        const path=pathFor(file),owner=owners.get(path.toLowerCase()),key=epKey(file);if(!key)continue;
        if(owner&&!owner.startsWith(`${show.id}:`)){report.duplicates.push({path,existingOwner:owner,candidate:show.id});continue}
        let episode=byEpisode.get(key);
        if(!episode){const id=`${show.id}_s${String(file.season).padStart(2,"0")}e${String(file.episode).padStart(2,"0")}`;episode=show.episodes[id]={id,season:+file.season,number:+file.episode,status:"backlog",rating:null,note:"",rewatches:0};byEpisode.set(key,episode)}
        if(episode.sourcePath&&episode.sourcePath.toLowerCase()!==path.toLowerCase()){
          episode.alternateSourcePaths=[...new Set([...(episode.alternateSourcePaths||[]),episode.sourcePath,path])];
          if(quality(path)>quality(episode.sourcePath)){episode.sourcePath=path;episode.sourceFilename=file.filename;report.upgrades++}
        }else{episode.sourcePath=path;episode.sourceFilename=file.filename}
        owners.set(path.toLowerCase(),`${show.id}:${episode.id}`);report.pathsLinked++;
      }
      show.sourcePaths=[...new Set([...(show.sourcePaths||[]),...(candidate.files||[]).map(pathFor)])];
      candidate.reconciliation={status:"matched",showId:show.id,checkedAt:new Date().toISOString()};report.matched++;
    }
    save.metadata.driveReconciliation={...report,completedAt:new Date().toISOString()};
  });
  return report;
}
