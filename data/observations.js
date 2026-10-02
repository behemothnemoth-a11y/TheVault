export const observationRules = [
  {
    id: "observation_ancient_backlog",
    rarity: "common",
    evaluate({ items, now }) {
      const old = Object.values(items)
        .filter(item => item.status !== "completed" && item.addedAt)
        .map(item => ({ item, days: Math.floor((now - new Date(item.addedAt)) / 86400000) }))
        .sort((a, b) => b.days - a.days)[0];
      return old?.days > 365 * 5
        ? `${old.item.title} has been waiting in the archive for ${old.days.toLocaleString()} days.`
        : null;
    }
  },
  {
    id: "observation_nearly_done",
    rarity: "common",
    evaluate({ items }) {
      const item = Object.values(items).find(entry => entry.progress && entry.progress.completed / entry.progress.total >= .7 && entry.status !== "completed");
      return item ? `${item.title} is ${Math.round(item.progress.completed / item.progress.total * 100)}% complete. The exit is visible.` : null;
    }
  },
  {
    id: "observation_quiet_archive",
    rarity: "rare",
    evaluate({ events }) {
      return events.length === 0 ? "THE ARCHIVE HAS BEEN QUIET. It is listening, though." : null;
    }
  }
];
