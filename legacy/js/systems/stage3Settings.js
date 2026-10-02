function decorateStage3Settings() {
  if (location.hash !== "#/settings") return;
  const view = document.querySelector("#view");
  if (!view) return;
  view.querySelectorAll(".panel__code").forEach(code => {
    if (code.textContent.trim() === "STAGE 2") code.textContent = "STAGE 3";
  });
  if (view.querySelector("[data-stage3-settings]")) return;
  const panel = document.createElement("section");
  panel.className = "panel";
  panel.dataset.stage3Settings = "";
  panel.style.marginTop = "15px";
  panel.innerHTML = `<div class="panel__header"><h2>TIME MACHINE</h2><span class="panel__code">STAGE 3</span></div>
    <p class="muted">Canonical item and episode events now feed a truthful searchable history. Imported dates are never guessed.</p>
    <button class="button primary" data-route="timeline">OPEN TIME MACHINE</button>`;
  view.append(panel);
}

function scheduleDecoration() {
  setTimeout(decorateStage3Settings, 0);
}

window.addEventListener("hashchange", scheduleDecoration);
window.addEventListener("load", scheduleDecoration, { once: true });
