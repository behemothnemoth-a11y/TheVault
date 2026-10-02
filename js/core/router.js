let routes = new Set();
let handler = () => {};

export function initRouter(validRoutes, onRoute) {
  routes = new Set(validRoutes);
  handler = onRoute;
  window.addEventListener("hashchange", resolve);
  resolve();
}

export function navigate(route) {
  const requested = String(route || "home").replace(/^#\//, "");
  const base = requested.split("/")[0];
  const safe = routes.has(base) ? requested : "home";
  if (location.hash === `#/${safe}`) resolve();
  else location.hash = `#/${safe}`;
}

function resolve() {
  const requested = location.hash.replace(/^#\//, "") || "home";
  const parts = requested.split("/").filter(Boolean).map(part => {
    try { return decodeURIComponent(part); } catch { return part; }
  });
  const base = routes.has(parts[0]) ? parts[0] : "home";
  handler(base, {
    path: base === "home" && parts[0] !== "home" ? "home" : requested,
    segments: base === parts[0] ? parts.slice(1) : []
  });
}
