import { getState } from "../core/store.js";
import { renderDailyDesk } from "./dailyDesk.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";

const latest = values => (values || [])[0] || null;

function statusCard({ tone = "", eyebrow, title, detail, route, action }) {
  return `<article class="panel today-status-card ${tone}">
    <span class="eyebrow">${esc(eyebrow)}</span>
    <h3>${esc(title)}</h3>
    <p>${esc(detail)}</p>
    <button class="button" data-route="${esc(route)}">${esc(action)}</button>
  </article>`;
}

export function renderTodayHub() {
  const state = getState();
  const sessions = state.metadata?.stage39?.plans || [];
  const activeId = state.metadata?.stage39?.activePlanId;
  const activeSession = sessions.find(plan => plan.id === activeId) || sessions.find(plan => ["active", "draft"].includes(plan.status)) || latest(sessions);
  const proposal = latest(state.metadata?.stage42?.proposals);
  const pending = (proposal?.actions || []).filter(action => action.status === "pending").length;
  const host = state.metadata?.stage41 || {};
  const brief = host.brief || null;
  const comparisons = (state.metadata?.stage38?.comparisons || []).length;

  const sessionCard = statusCard({
    tone: activeSession ? "is-ready" : "",
    eyebrow: "SESSION",
    title: activeSession ? activeSession.title || "A session is ready" : "Nothing planned yet",
    detail: activeSession ? `${activeSession.entries?.length || 0} choices ready when you are.` : "Build a watch, play, or reading session around the time you have.",
    route: "session",
    action: activeSession ? "OPEN SESSION" : "PLAN A SESSION"
  });
  const assistantCard = statusCard({
    tone: pending ? "needs-attention" : "",
    eyebrow: "VAULT ASSISTANT",
    title: pending ? `${pending} option${pending === 1 ? "" : "s"} waiting` : "Nothing needs approval",
    detail: pending ? "Review prepared ideas before anything changes." : "The Assistant stays quiet until it has something useful.",
    route: "companion",
    action: pending ? "REVIEW OPTIONS" : "OPEN ASSISTANT"
  });
  const hostCard = statusCard({
    eyebrow: "BACKGROUND CARE",
    title: host.enabled === false ? "Paused" : brief?.outcome === "attention" ? "A check needs attention" : "Everything looks good",
    detail: host.enabled === false ? "Background checks are currently paused." : "Keeps Today fresh and watches local archive health while the Vault is open.",
    route: "host",
    action: "VIEW CARE"
  });
  const tasteCard = statusCard({
    eyebrow: "TASTE SIGNALS",
    title: comparisons ? `${comparisons} choices learned` : "Ready to learn your taste",
    detail: "Quick comparisons make recommendations feel more like yours.",
    route: "calibrate",
    action: "CALIBRATE"
  });

  return `<section class="today-overview" aria-labelledby="today-overview-title">
    <div class="today-overview__heading"><div><span class="eyebrow">AT A GLANCE</span><h2 id="today-overview-title">TODAY IN THE VAULT</h2></div><p>One calm place for what is ready, waiting, and worth opening next.</p></div>
    <div class="today-status-grid">${sessionCard}${assistantCard}${hostCard}${tasteCard}</div>
  </section>${renderDailyDesk()}`;
}
