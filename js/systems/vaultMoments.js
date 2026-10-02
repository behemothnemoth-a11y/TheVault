import { emit } from "../core/events.js";

let midnightTimer;

export function startVaultMoments(showMoment) {
  const schedule = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    midnightTimer = setTimeout(() => {
      showMoment("ANOTHER DAY HAS BEEN ARCHIVED.", "The date changed while the Vault was open.");
      emit("VAULT_MOMENT_TRIGGERED", { meta: { moment: "midnight" } });
      schedule();
    }, midnight - now);
  };
  schedule();
  return () => clearTimeout(midnightTimer);
}

export function ancientBacklogDays(item) {
  if (!item.addedAt) return 0;
  return Math.floor((Date.now() - new Date(item.addedAt)) / 86400000);
}
