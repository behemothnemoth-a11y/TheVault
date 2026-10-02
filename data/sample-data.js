const records = [
  {
    id: "movie_signal_from_orbit_1987", type: "movie", wing: "movies",
    title: "Signal from Orbit", year: 1987, genres: ["Science Fiction", "Horror"],
    runtime: 96, status: "completed", completedAt: "2021-10-14T02:12:00.000Z",
    rating: 8, addedAt: "2017-05-03T12:00:00.000Z",
    note: "The miniature work still rules.", collectionIds: ["collection_midnight_transmissions"]
  },
  {
    id: "movie_house_beneath_lake_1974", type: "movie", wing: "movies",
    title: "The House Beneath the Lake", year: 1974, genres: ["Horror"],
    runtime: 88, status: "backlog", rating: null, addedAt: "2018-01-04T12:00:00.000Z",
    note: "", collectionIds: ["collection_midnight_transmissions"]
  },
  {
    id: "movie_neon_highway_1993", type: "movie", wing: "movies",
    title: "Neon Highway", year: 1993, genres: ["Action"], runtime: 104,
    status: "completed", completedAt: "2025-07-29T03:10:00.000Z", rating: 7,
    addedAt: "2025-07-22T12:00:00.000Z", note: ""
  },
  {
    id: "tv_goblin_county_2004", type: "tv", wing: "tv",
    title: "Goblin County", year: 2004, genres: ["Comedy", "Fantasy"],
    status: "in_progress", rating: 9, addedAt: "2020-04-01T12:00:00.000Z",
    progress: { completed: 17, total: 24 }, note: "Season two gets gloriously strange."
  },
  {
    id: "tv_night_shift_archive_1998", type: "tv", wing: "tv",
    title: "Night Shift Archive", year: 1998, genres: ["Mystery"],
    status: "backlog", rating: null, addedAt: "2016-11-08T12:00:00.000Z",
    progress: { completed: 0, total: 13 }, note: ""
  },
  {
    id: "game_iron_moon_salvage", type: "game", wing: "games",
    title: "Iron Moon Salvage", year: 2012, genres: ["RPG", "Science Fiction"],
    status: "in_progress", rating: 8, addedAt: "2019-09-18T12:00:00.000Z",
    progress: { completed: 22, total: 40 }, note: "Returned after abandoning the first run."
  },
  {
    id: "game_dungeon_accountant", type: "game", wing: "games",
    title: "Dungeon Accountant", year: 2023, genres: ["Strategy"],
    status: "completed", completedAt: "2024-02-19T12:00:00.000Z", rating: 9,
    addedAt: "2024-02-02T12:00:00.000Z", note: ""
  },
  {
    id: "book_cartography_of_dreams", type: "book", wing: "books",
    title: "A Cartography of Dreams", year: 1981, genres: ["Fantasy"],
    status: "in_progress", rating: null, addedAt: "2026-06-11T12:00:00.000Z",
    progress: { completed: 219, total: 410 }, note: ""
  },
  {
    id: "book_last_video_store", type: "book", wing: "books",
    title: "The Last Video Store", year: 2019, genres: ["Nonfiction"],
    status: "backlog", rating: null, addedAt: "2021-03-07T12:00:00.000Z",
    note: ""
  }
];

export const sampleItems = Object.fromEntries(records.map(record => [record.id, record]));

export const collections = {
  collection_midnight_transmissions: {
    id: "collection_midnight_transmissions",
    title: "Midnight Transmissions",
    itemIds: ["movie_signal_from_orbit_1987", "movie_house_beneath_lake_1974"]
  }
};
