import { reconcileAcceptedDriveScans } from "./catalogReconciliation.js";
const VIDEO = new Set(["mkv","mp4","avi","m4v","mov","wmv","webm","rmvb"]);
const EPISODE = /(?:^|[.\s_-])s(\d{1,2})e(\d{1,3})(?:[.\s_-]|$)/i;
const clean = value => value.replace(/[._]+/g," ").replace(/\s+/g," ").trim().replace(/\b(?:19|20)\d{2}\b.*$/,"").trim();
queueMicrotask(() => { try { reconcileAcceptedDriveScans(); } catch {} });
async function walk(handle,path,found,base,limit){
  for await(const [name,child] of handle.entries()){
    if(found.length>=limit)return;
    const relative=path?`${path}\\${name}`:name;
    if(child.kind==="directory")await walk(child,relative,found,base,limit);
    else{
      if(!VIDEO.has(name.split(".").pop().toLowerCase()))continue;
      const match=name.match(EPISODE),parts=relative.split("\\");
      const seasonFolder=parts.findIndex(part=>/^season\s*\d+$/i.test(part));
      const titlePart=seasonFolder>0?parts[seasonFolder-1]:parts.length>1?parts[0]:name.replace(/\.[^.]+$/,"");
      found.push({path:relative,sourcePath:`${base}\\${relative}`,filename:name,detectedTitle:clean(titlePart),
        season:match?Number(match[1]):null,episode:match?Number(match[2]):null,confidence:match&&titlePart?"high":titlePart?"medium":"low"});
    }
  }
}
export async function chooseAndScanDirectory(limit=25000){
  if(!window.showDirectoryPicker)throw new Error("Folder scanning is not supported in this browser.");
  const handle=await window.showDirectoryPicker({mode:"read"});
  const base=/^tv shows$/i.test(handle.name)?"D:\\TV Shows":/^d:?$/i.test(handle.name)?"D:\\":`D:\\${handle.name}`;
  const files=[];await walk(handle,"",files,base,limit);
  const groups=new Map();
  files.forEach(file=>{const key=file.detectedTitle.toLowerCase();if(!key)return;if(!groups.has(key))groups.set(key,{title:file.detectedTitle,files:[],confidence:file.confidence});groups.get(key).files.push(file)});
  return{rootName:handle.name,scannedAt:new Date().toISOString(),fileCount:files.length,candidates:[...groups.values()].map((c,i)=>({id:`scan_${Date.now().toString(36)}_${i.toString(36)}`,status:"pending",...c}))};
}
