export function createJobControl(){
  let paused=false,cancelled=false,resumeWaiters=[];
  const release=()=>{for(const resolve of resumeWaiters.splice(0))resolve()};
  const control={
    get paused(){return paused},get cancelled(){return cancelled},
    pause(){if(cancelled)return false;paused=true;return true},
    resume(){paused=false;release();return true},
    cancel(){cancelled=true;paused=false;release();return true},
    async checkpoint(){if(cancelled){if(globalThis.__vaultActiveJobControl===control)globalThis.__vaultActiveJobControl=null;const error=new Error("Task cancelled safely. Completed items were kept; untouched items remain eligible for the next run.");error.code="VAULT_JOB_CANCELLED";throw error}if(paused)await new Promise(resolve=>resumeWaiters.push(resolve));if(cancelled){if(globalThis.__vaultActiveJobControl===control)globalThis.__vaultActiveJobControl=null;const error=new Error("Task cancelled safely. Completed items were kept; untouched items remain eligible for the next run.");error.code="VAULT_JOB_CANCELLED";throw error}}
  };globalThis.__vaultActiveJobControl=control;return control
}
