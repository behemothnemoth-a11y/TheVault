// The rooms the current shell exposes. Anything not listed here is not a route:
// the router falls back to Home. Rooms marked "reserved" render the placeholder
// from js/wings/placeholders.js until they are designed.
export const wings = [
  { id: "home", label: "HOME", icon: "⌂", group: "MAIN" },
  { id: "dashboard", label: "LIFE DASHBOARD", icon: "⌁", group: "MAIN" },
  { id: "tonight", label: "TONIGHT", icon: "☾", group: "MAIN", reserved: true },
  { id: "today", label: "TODAY", icon: "▦", group: "MAIN", reserved: true },
  { id: "session", label: "PLAN A SESSION", icon: "P", group: "MAIN", reserved: true },
  { id: "tv", label: "TV", icon: "▤", group: "LIBRARY" },
  { id: "movies", label: "MOVIES", icon: "◆", group: "LIBRARY" },
  { id: "games", label: "GAMES", icon: "✚", group: "LIBRARY" },
  { id: "books", label: "BOOKS", icon: "▥", group: "LIBRARY" },
  { id: "music", label: "MUSIC", icon: "♫", group: "LIBRARY" },
  { id: "youtube", label: "YOUTUBE", icon: "▶", group: "LIBRARY" },
  { id: "podcasts", label: "PODCASTS", icon: "◉", group: "LIBRARY" },
  { id: "manga", label: "COMICS / MANGA", icon: "M", group: "LIBRARY" },
  { id: "food", label: "FOOD", icon: "F", group: "LIFE" },
  { id: "trips", label: "TRIPS", icon: "✈", group: "LIFE" },
  { id: "calendar", label: "CALENDAR", icon: "▦", group: "LIFE" },
  { id: "writing", label: "WRITING", icon: "W", group: "LIFE" },
  { id: "projects", label: "PROJECTS", icon: "✎", group: "LIFE" },
  { id: "companion", label: "VAULT ASSISTANT", icon: "A", group: "LIFE", reserved: true },
  { id: "museum", label: "LIVING MUSEUM", icon: "M", group: "LIFE", reserved: true },
  { id: "settings", label: "SETTINGS / DATA", icon: "⚙", group: "UTILITY", reserved: true }
];
