export const achievementDefinitions = [
  {
    id: "achievement_first_archive", title: "Roll Credits", icon: "▣",
    description: "Archive your first item.", secret: false, xp: 25,
    test: ({ events }) => events.some(event => event.type === "ITEM_COMPLETED")
  },
  {
    id: "achievement_opinionated", title: "Opinionated", icon: "★",
    description: "Record five ratings.", secret: false, xp: 25,
    test: ({ items }) => Object.values(items).filter(item => item.rating).length >= 5
  },
  {
    id: "achievement_archaeologist", title: "Archaeologist", icon: "⌛",
    description: "Complete something after five years in the backlog.", secret: false, xp: 50,
    test: ({ events }) => events.some(event => event.type === "ANCIENT_BACKLOG_COMPLETED")
  },
  {
    id: "achievement_are_you_lost", title: "Are You Lost?", icon: "?",
    description: "???", secret: true, xp: 40,
    test: ({ events }) => events.some(event => event.type === "BASEMENT_FOUND")
  }
  ,{
    id: "achievement_series_sealed", title: "Roll All Credits", icon: "■", xp: 50,
    description: "Seal an entire television series.", secret: false,
    test: ({ events }) => events.some(event => event.type === "SHOW_SEALED")
  },
  {
    id: "achievement_collection_sealed", title: "Shelf Control", icon: "▣", xp: 50,
    description: "Seal a complete collection.", secret: false,
    test: ({ events }) => events.some(event => event.type === "COLLECTION_SEALED")
  },
  {
    id: "achievement_expedition", title: "There and Back Again", icon: "⚑", xp: 50,
    description: "Complete an Expedition.", secret: false,
    test: ({ events }) => events.some(event => event.type === "EXPEDITION_COMPLETED")
  }];
