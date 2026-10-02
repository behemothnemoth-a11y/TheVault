import { escapeHtml as esc } from './safeHtml.js';
import { wings } from './navigation.js?v=20260913-life-v1';
import { continueItems, lastTouched } from '../systems/homeArchiveCards.js?v=20261001-home-final-v1';

// A Resume action must point at a measured, unfinished episode, not a random pick.
export function resumeEpisode(item) {
  return Object.values(item.episodes || {})
    .filter(ep => ep.id && ep.sourcePath && ep.status !== 'completed' && Number(ep.playbackSeconds) > 0)
    .sort((a, b) => (Date.parse(b.lastPlayedAt) || 0) - (Date.parse(a.lastPlayedAt) || 0))[0] || null;
}

function artwork(item) {
  const value = typeof item.artwork === 'string' ? item.artwork : item.artwork?.localPath || item.artwork?.url || '';
  // Home uses existing local covers; loading Home never requests new artwork.
  return /^(?:\.\/)?assets\//.test(value) || /^\/assets\//.test(value) ? value : '';
}

function action(item, ep) {
  return ep ? `data-play-episode data-show-id="${esc(item.id)}" data-episode-id="${esc(ep.id)}"`
    : `data-home-continue="${esc(item.id)}" data-wing="${esc(item.wing)}"`;
}

function progress(ep) {
  const total = Number(ep?.durationSeconds), position = Number(ep?.playbackSeconds);
  if (!(total > 0 && position > 0)) return '';
  const percent = Math.max(0, Math.min(100, position / total * 100));
  return `<div class="cinema-progress"><progress value="${percent}" max="100" aria-label="Episode progress"></progress><span>${Math.max(1, Math.ceil((total-position)/60))} min remaining</span></div>`;
}

const code = ep => `S${String(ep.season).padStart(2, '0')} E${String(ep.number).padStart(2, '0')}`;

export function renderCinemaMedia(state, between = "") {
  const candidates = continueItems(state, 24).map(row => row.item);
  const resumable = Object.values(state.items || {}).filter(item => item.wing === 'tv' && item.title && resumeEpisode(item))
    .sort((a,b) => (lastTouched(b)?.getTime() || 0) - (lastTouched(a)?.getTime() || 0));
  const rows = [...new Map([...resumable, ...candidates].map(item => [item.id, item])).values()].slice(0,4);
  const featured = rows[0];
  if (!featured) return `<section class="cinema-hero cinema-empty"><div class="cinema-hero-copy"><span class="cinema-kicker">YOUR PERSONAL COLLECTION</span><h1>A good evening starts here.</h1><p>Find something in your library. What you start will be waiting here next time.</p><button class="cinema-primary" data-route="tv">Browse TV</button><button data-route="movies">Explore movies</button></div></section>${between}`;
  const episode = resumeEpisode(featured), art = artwork(featured);
  return `<section class="cinema-hero">
    ${art ? `<img class="cinema-hero-art" src="${esc(art)}" alt="" fetchpriority="high">` : '<div class="cinema-hero-placeholder" aria-hidden="true">V</div>'}
    <div class="cinema-hero-copy"><span class="cinema-kicker">${episode ? 'CONTINUE WATCHING' : 'BACK TO YOUR COLLECTION'}</span>
      <h1>${esc(featured.title)}</h1>
      <p class="cinema-episode">${episode ? `${esc(code(episode))}${episode.title ? ` · ${esc(episode.title)}` : ''}` : esc(featured.wing)}</p>
      <p class="cinema-description">${esc(featured.description || 'Pick up where you left off.')}</p>
      <div class="cinema-hero-actions"><button class="cinema-primary" ${action(featured,episode)}>▶ ${episode ? 'Resume' : 'Open'}</button><button data-home-continue="${esc(featured.id)}" data-wing="${esc(featured.wing)}">View details</button></div>
      ${progress(episode)}
    </div></section>
    ${between}
    <section class="cinema-continue" aria-label="Continue your collection"><header><h2>Continue</h2><span>Pick up where you left off</span></header><div class="cinema-media-grid">${rows.map(item => {
      const ep = resumeEpisode(item), cover = artwork(item);
      return `<button class="cinema-media-card" ${action(item,ep)} aria-label="${ep ? 'Resume' : 'Open'} ${esc(item.title)}"><span class="cinema-cover">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : `<span>${esc(item.title)}</span>`}<i aria-hidden="true">${ep ? '▶' : '↗'}</i></span><b>${esc(item.title)}</b><small>${ep ? esc(code(ep)) : esc(item.wing)}</small></button>`;
    }).join('')}</div></section>`;
}

export function renderCinemaShell(content) {
  const primary = ['home','tv','movies','games','books'];
  const scale = document.body.dataset.uiScale || '115';
  return `<div class="cinema-home"><header class="cinema-nav"><button class="cinema-brand" data-route="home" aria-label="The Vault home"><span aria-hidden="true">▤</span> THE VAULT</button>
    <nav aria-label="Vault rooms">${primary.map(id => `<button data-route="${id}" ${id === 'home' ? 'class="active" aria-current="page"' : ''}>${id === 'tv' ? 'TV' : id[0].toUpperCase()+id.slice(1)}</button>`).join('')}
    <details class="cinema-more"><summary>More ▾</summary><div>${wings.filter(w=>!primary.includes(w.id)).map(w=>`<button data-route="${esc(w.id)}">${esc(w.label)}</button>`).join('')}</div></details></nav>
    <button class="cinema-search" data-command>⌕ <span>Search your library…</span></button>
    <div class="cinema-scale" aria-label="Interface size"><button data-ui-scale="-1" aria-label="Make text smaller" ${scale==='90'?'disabled':''}>A−</button><span>${esc(scale)}%</span><button data-ui-scale="1" aria-label="Make text larger" ${scale==='170'?'disabled':''}>A+</button></div>
  </header><main class="cinema-content">${content}</main><footer class="cinema-footer">THE VAULT <span>Your collection. Your evening.</span></footer></div>`;
}
