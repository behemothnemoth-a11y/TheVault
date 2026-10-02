(function () {
  let failure = null;
  let finished = false;

  function readableError(value) {
    const text = String(value && (value.message || value) || "The interface could not finish loading.");
    return text.length > 240 ? `${text.slice(0, 237)}...` : text;
  }

  function showFailure(reason) {
    if (finished) return;
    failure = readableError(reason);
    const view = document.querySelector("#view");
    if (!view) return;
    const safeReason = failure.replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[character]);
    view.innerHTML = `
      <section class="panel" style="max-width:760px;margin:clamp(28px,8vh,90px) auto;padding:clamp(24px,4vw,46px);border-color:#a97b25">
        <span class="eyebrow">VAULT STARTUP SAFETY</span>
        <h2 style="margin:.65rem 0">THE INTERFACE DID NOT FINISH OPENING</h2>
        <p>Your library data is still stored safely. The Vault stopped before changing anything.</p>
        <p class="muted" style="overflow-wrap:anywhere">${safeReason}</p>
        <button type="button" data-vault-reload>RELOAD VAULT</button>
      </section>`;
    view.querySelector("[data-vault-reload]").onclick = () => location.reload();
  }

  window.VaultStartup = {
    phase() {},
    fail: showFailure,
    complete() {
      finished = true;
      document.documentElement.dataset.vaultReady = "true";
      window.dispatchEvent(new Event("vault-ready"));
    }
  };

  window.addEventListener("error", event => showFailure(event.error || event.message));
  window.addEventListener("unhandledrejection", event => showFailure(event.reason));
  window.setTimeout(() => {
    if (!finished) showFailure(failure || "A startup module did not respond within 12 seconds.");
  }, 12000);
})();

