const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));

export function mountComicStrip({stage,pageCount,startIndex=0,fetchPage,mode="continuous",direction="ltr",onIndex=()=>{},onError=()=>{}}){
  const total=Math.max(1,Number(pageCount||1)),initial=clamp(startIndex,0,total-1);
  const scroller=document.createElement("div");
  scroller.className=`vault-comic-strip vault-comic-strip--${mode}`;
  scroller.style.visibility="hidden";
  scroller.style.scrollBehavior="auto";
  scroller.dataset.direction=direction;
  scroller.innerHTML=Array.from({length:total},(_,index)=>`<figure class="vault-comic-strip__page" data-comic-page="${index}" aria-label="Page ${index+1}"><div class="vault-comic-strip__placeholder"><span>PAGE ${index+1}</span></div></figure>`).join("");
  stage.replaceChildren(scroller);
  let current=initial,destroyed=false,scrollTimer=0,settling=true,settleTimers=[];
  const pages=[...scroller.querySelectorAll("[data-comic-page]")];
  const load=async element=>{
    if(!element||element.dataset.loaded||element.dataset.loading)return;
    element.dataset.loading="true";
    const pageIndex=Number(element.dataset.comicPage);
    try{
      const page=await fetchPage(pageIndex);
      if(destroyed)return;
      if(page.kind!=="image")throw new Error(`Page ${pageIndex+1} is not an image.`);
      const image=new Image();
      image.className="vault-comic-strip__image";
      image.alt=`Page ${pageIndex+1}`;
      image.decoding="async";
      image.src=page.dataUrl;
      await image.decode().catch(()=>{});
      if(destroyed)return;
      const previousHeight=element.getBoundingClientRect().height;
      element.replaceChildren(image);
      element.dataset.loaded="true";
      if(pageIndex<current){const heightDelta=element.getBoundingClientRect().height-previousHeight;if(Math.abs(heightDelta)>1)scroller.scrollTop+=heightDelta}
    }catch(error){
      element.innerHTML=`<div class="vault-comic-strip__error"><b>PAGE ${pageIndex+1} COULD NOT LOAD</b><button type="button">RETRY</button></div>`;
      element.querySelector("button").onclick=()=>{delete element.dataset.loading;delete element.dataset.loaded;load(element)};
      onError(error,pageIndex);
    }finally{delete element.dataset.loading}
  };
  const preload=pageIndex=>{for(let offset=0;offset<=3;offset+=1)load(pages[pageIndex+offset])};
  const nearestPage=()=>{
    const center=scroller.getBoundingClientRect().top+scroller.clientHeight*.42;
    let best=current,distance=Infinity;
    pages.forEach((page,pageIndex)=>{const rect=page.getBoundingClientRect(),candidate=Math.abs((rect.top+Math.min(rect.height,scroller.clientHeight)*.45)-center);if(candidate<distance){distance=candidate;best=pageIndex}});
    if(!settling&&best!==current){current=best;preload(current);onIndex(current)}
  };
  const goTo=(target,{behavior="smooth",notify=true}={})=>{
    current=clamp(target,0,total-1);preload(current);
    const page=pages[current];
    if(page){const pageBounds=page.getBoundingClientRect(),scrollBounds=scroller.getBoundingClientRect(),top=Math.max(0,scroller.scrollTop+pageBounds.top-scrollBounds.top-18);if(behavior==="auto")scroller.scrollTop=top;else scroller.scrollTo({top,behavior})}
    if(notify){settling=false;settleTimers.forEach(clearTimeout);onIndex(current)}
    return current;
  };
  goTo(initial,{behavior:"auto",notify:false});
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting)load(entry.target)}),{root:scroller,rootMargin:"0px 0px 140% 0px",threshold:.01});
  scroller.addEventListener("scroll",()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(nearestPage,80)},{passive:true});
  requestAnimationFrame(()=>goTo(initial,{behavior:"auto",notify:false}));
  settleTimers=[
    setTimeout(()=>{if(destroyed)return;goTo(initial,{behavior:"auto",notify:false});pages.forEach(page=>observer.observe(page));scroller.style.visibility="visible"},100),
    setTimeout(()=>{if(!destroyed)goTo(initial,{behavior:"auto",notify:false})},280),
    setTimeout(()=>{if(!destroyed)goTo(initial,{behavior:"auto",notify:false});settling=false},620)
  ];
  return {
    get index(){return current},
    goTo,
    next(){return goTo(current+1)},
    previous(){return goTo(current-1)},
    recenter(){goTo(current,{behavior:"auto",notify:false})},
    destroy(){destroyed=true;clearTimeout(scrollTimer);settleTimers.forEach(clearTimeout);observer.disconnect()}
  };
}
