// Presentation-only grouping: canonical items, progress and artwork are untouched.
export function localComicCollection(item) {
  const path=String(item.sourcePath||item.comicMeta?.sourcePath||"");
  const parts=path.split(/[\\/]/);
  const folder=parts.slice(0,-1).map(part=>part.replace(/\[[^\]]*\]/g,"").trim()).find(part=>/\bcomics?\s+collection$/i.test(part));
  return folder?folder.replace(/\s+collection$/i,""):"";
}
export function localComicDisplay(item) {
  if(!localComicCollection(item))return item;
  const parts=String(item.sourcePath||item.comicMeta?.sourcePath||"").split(/[\\/]/);
  const match=parts.at(-1)?.replace(/\.[^.]+$/,"").match(/^(\d+)\s*-\s*(.+?)\s*-\s*(.+)$/);
  if(!match)return item;
  const section=parts.find(part=>/^Series\s+\d+$/i.test(part));
  const rawTitle=/^\d+\s*-/.test(item.title);
  return {...item,title:rawTitle?`${section?section+" · ":""}${match[2]}`:item.title,creator:item.creator||match[3]};
}
