import { escapeHtml } from "./safeHtml.js";

export function openCommandPalette(commands) {
  const root = document.querySelector("#palette-root");
  root.innerHTML = `<div class="palette-backdrop"><section class="palette" role="dialog" aria-modal="true">
    <input aria-label="Vault command" placeholder="TYPE A COMMAND..." autocomplete="off">
    <div class="palette-results"></div>
  </section></div>`;
  const input = root.querySelector("input");
  const results = root.querySelector(".palette-results");
  let filtered = commands;
  let selected = 0;

  const draw = () => {
    const query = input.value.trim().toLowerCase();
    filtered = commands.filter(command => command.label.toLowerCase().includes(query) || command.keywords?.includes(query));
    const structured = query ? window.vaultStructuredCommand?.(query) : null;
    if (structured && !filtered.some(command => command.label.toLowerCase() === structured.label)) filtered.unshift(structured);
    selected = Math.min(selected, Math.max(0, filtered.length - 1));
    results.innerHTML = filtered.length
      ? filtered.slice(0, 12).map((command, index) => `<button class="palette-result ${index === selected ? "selected" : ""}" data-index="${index}"><span>${escapeHtml(command.label)}</span><small>${escapeHtml(command.hint || "")}</small></button>`).join("")
      : `<div class="empty">NO MATCHING ARCHIVE COMMAND</div>`;
  };
  const close = () => root.innerHTML = "";
  const execute = index => { const command = filtered[index]; if (command) { close(); command.run(); } };
  input.oninput = () => { selected = 0; draw(); };
  input.onkeydown = event => {
    if (event.key === "Escape") close();
    if (event.key === "ArrowDown") { event.preventDefault(); selected = Math.min(selected + 1, filtered.length - 1); draw(); }
    if (event.key === "ArrowUp") { event.preventDefault(); selected = Math.max(selected - 1, 0); draw(); }
    if (event.key === "Enter") execute(selected);
  };
  results.onclick = event => { const result = event.target.closest("[data-index]"); if (result) execute(Number(result.dataset.index)); };
  root.querySelector(".palette-backdrop").onclick = event => { if (event.target.classList.contains("palette-backdrop")) close(); };
  draw();
  input.focus();
}
