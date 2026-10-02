export const expeditionDefinitions = [
  {
    id: "expedition_archaeological_dig",
    title: "Archaeological Dig",
    description: "Bring neglected records back into the light.",
    objectives: [
      { id: "ancient_one", label: "Complete one item added at least five years ago", target: 1, eventType: "ANCIENT_BACKLOG_COMPLETED" },
      { id: "notes_two", label: "Leave notes on two records", target: 2, eventType: "NOTE_ADDED" }
    ],
    reward: "75 XP · ARCHIVIST'S DUST JACKET"
  },
  {
    id: "expedition_finish_line",
    title: "Finish What You Started",
    description: "Close loops across more than one room of the archive.",
    objectives: [
      { id: "finish_items", label: "Archive three items", target: 3, eventType: "ITEM_COMPLETED" },
      { id: "finish_episodes", label: "Archive five television episodes", target: 5, eventType: "EPISODE_COMPLETED" }
    ],
    reward: "75 XP · CLOSURE STAMP"
  },
  {
    id: "expedition_one_weird_night",
    title: "One Weird Night",
    description: "Follow curiosity instead of optimization.",
    objectives: [
      { id: "discover_three", label: "Enter three different Vault wings", target: 3, eventType: "WING_VISITED", uniqueBy: "wing" },
      { id: "rate_one", label: "Record one strong opinion", target: 1, eventType: "ITEM_RATED" }
    ],
    reward: "75 XP · QUESTIONABLE ROUTE BADGE"
  }
];
