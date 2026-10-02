export function toast(title, message, duration = 3600) {
  const region = document.querySelector("#toast-region");
  const node = document.createElement("div");
  node.className = "toast";
  node.innerHTML = `<b>${escapeHtml(title)}</b><span>${escapeHtml(message)}</span>`;
  region.append(node);
  setTimeout(() => node.remove(), duration);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
