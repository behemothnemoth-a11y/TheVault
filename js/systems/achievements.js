import { achievementDefinitions } from "../../data/achievements.js";
import { emit } from "../core/events.js";
import { getState, update } from "../core/store.js";
import { profileForXp } from "./progression.js";

let checking = false;

export function getAchievementDefinitions(state = getState()) {
  return [...achievementDefinitions, ...Object.values(state.metadata?.stage20?.definitions || {}).filter(definition => definition.status !== "archived")];
}

export function evaluateAchievement(definition, state = getState()) {
  if (definition.test) return { passed: Boolean(definition.test(state)), evidence: { legacyRule: definition.id } };
  const rule = definition.rule || {};
  if (rule.type === "event_count") {
    const events = (state.events || []).filter(event => event.type === rule.eventType);
    return { passed: events.length >= Number(rule.target || 1), evidence: { eventType: rule.eventType, count: events.length, target: Number(rule.target || 1), eventIds: events.slice(-20).map(event => event.id) } };
  }
  if (rule.type === "item_count") {
    const items = Object.values(state.items || {}).filter(item =>
      (!rule.wing || item.wing === rule.wing) && (!rule.status || item.status === rule.status) &&
      (!rule.minRating || Number(item.rating || 0) >= Number(rule.minRating))
    );
    return { passed: items.length >= Number(rule.target || 1), evidence: { wing: rule.wing || null, status: rule.status || null, minRating: rule.minRating || null, count: items.length, target: Number(rule.target || 1), itemIds: items.slice(0, 50).map(item => item.id) } };
  }
  if (rule.type === "achievement_chain") {
    const unlocked = state.achievements?.[rule.requiresAchievementId];
    return { passed: Boolean(unlocked), evidence: { requiresAchievementId: rule.requiresAchievementId, unlockedAt: unlocked?.unlockedAt || null } };
  }
  return { passed: false, evidence: { unsupportedRule: rule.type || null } };
}

export function checkAchievements() {
  if (checking) return;
  checking = true;
  try {
    for (const definition of getAchievementDefinitions()) {
      const state = getState();
      if (state.achievements[definition.id]) continue;
      const evaluation = evaluateAchievement(definition, state);
      if (!evaluation.passed) continue;
      update(save => {
        save.achievements[definition.id] = {
          unlockedAt: new Date().toISOString(), evidence: evaluation.evidence,
          definitionVersion: Number(definition.version || 1)
        };
        save.profile.xp += Number(definition.xp || 25);
        const profile = profileForXp(save.profile.xp);
        save.profile.level = profile.level;
        save.profile.title = profile.title;
      });
      emit("ACHIEVEMENT_UNLOCKED", {
        achievementId: definition.id,
        meta: { title: definition.title, icon: definition.icon, evidence: evaluation.evidence }
      });
    }
  } finally { checking = false; }
}

export function getAchievements() {
  const state = getState();
  return getAchievementDefinitions(state).map(definition => ({ ...definition, unlocked: state.achievements[definition.id] || null }));
}
