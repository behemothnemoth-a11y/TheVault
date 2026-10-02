(function(){
  let progressed=false;
  const root=()=>document.querySelector("[data-vault-startup]");
  const phase=(percent,title,detail)=>{const node=root();if(!node)return;if(Number(percent)>4)progressed=true;node.hidden=false;node.dataset.state="working";node.querySelector("[data-startup-title]").textContent=title;node.querySelector("[data-startup-detail]").textContent=detail||"";node.querySelector("[data-startup-percent]").textContent=`${Math.max(0,Math.min(100,Number(percent)||0))}%`;node.querySelector("[data-startup-bar]").style.width=`${Math.max(2,Math.min(100,Number(percent)||0))}%`};
  const fail=message=>{const node=root();if(!node)return;node.hidden=false;node.dataset.state="failed";node.querySelector("[data-startup-title]").textContent="VAULT STARTUP PAUSED";node.querySelector("[data-startup-detail]").textContent=String(message||"The main screen could not finish loading.");node.querySelector("[data-startup-percent]").textContent="CHECK NEEDED";node.querySelector("[data-startup-bar]").style.width="100%";if(!node.querySelector("[data-startup-reload]")){const button=document.createElement("button");button.type="button";button.dataset.startupReload="";button.textContent="RELOAD VAULT";button.onclick=()=>location.reload();node.querySelector(".vault-startup-screen__panel").append(button)}};
  const complete=()=>{phase(100,"VAULT ONLINE","Opening command center…");setTimeout(()=>{const node=root();if(node){node.classList.add("is-complete");setTimeout(()=>node.hidden=true,420)}},180)};
  window.VaultStartup={phase,fail,complete};
  window.addEventListener("error",event=>fail(event.error?.message||event.message));
  window.addEventListener("unhandledrejection",event=>fail(event.reason?.message||event.reason||"A startup task did not finish."));
  document.addEventListener("DOMContentLoaded",()=>phase(4,"POWERING THE VAULT","Loading the local interface and safety systems…"),{once:true});
  setTimeout(()=>{if(!progressed)fail("The main interface did not start. Reload to retry with the newest local files.")},10000);
})();
