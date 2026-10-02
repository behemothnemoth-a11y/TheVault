import { getState, update } from "../core/store.js";
import { generatedTvArtwork } from "./generatedTvArtwork.js";

const bundledArtwork = {
  ...generatedTvArtwork,
  tv_legacy_archer: "./assets/artwork/library/tv_legacy_archer.jpg",
  tv_legacy_the_oblongs: "./assets/artwork/library/tv_legacy_the_oblongs.png",
  tv_legacy_samurai_jack: "./assets/artwork/library/tv_legacy_samurai_jack.jpg",
  tv_legacy_freakazoid: "./assets/artwork/library/tv_legacy_freakazoid.jpg",
  tv_legacy_brooklyn_nine_nine: "./assets/artwork/library/tv_legacy_brooklyn_nine_nine.jpg",
  tv_legacy_married_with_children: "./assets/artwork/library/tv_legacy_married_with_children.jpg",
  tv_legacy_seinfeld: "./assets/artwork/library/tv_legacy_seinfeld.jpg",
  tv_legacy_mythbusters: "./assets/artwork/library/tv_legacy_mythbusters.jpg",
  tv_legacy_spongebob_squarepants: "./assets/artwork/library/tv_legacy_spongebob_squarepants.jpg",
  tv_legacy_fawlty_towers: "./assets/artwork/library/tv_legacy_fawlty_towers.jpg",
  tv_legacy_monty_pythons_flying_circus: "./assets/artwork/library/tv_legacy_monty_pythons_flying_circus.jpg",
  tv_legacy_lost: "./assets/artwork/library/tv_legacy_lost.jpg",
  tv_legacy_narcos: "./assets/artwork/library/tv_legacy_narcos.jpg",
  tv_legacy_inuyasha_final_act: "./assets/artwork/library/tv_legacy_inuyasha_final_act.jpg",
  tv_legacy_the_blue_planet: "./assets/artwork/library/tv_legacy_the_blue_planet.jpg",
  tv_legacy_south_park: { localPath: "./assets/artwork/library/tv_legacy_south_park.jpg", source: "tvmaze", sourceId: 112, sourcePage: "https://www.tvmaze.com/shows/112/south-park", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/594/1485766.jpg" },
  tv_legacy_rugrats: { localPath: "./assets/artwork/library/tv_legacy_rugrats.jpg", source: "tvmaze", sourceId: 421, sourcePage: "https://www.tvmaze.com/shows/421/rugrats", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/402/1007439.jpg" },
  tv_legacy_adventure_time: { localPath: "./assets/artwork/library/tv_legacy_adventure_time.jpg", source: "tvmaze", sourceId: 290, sourcePage: "https://www.tvmaze.com/shows/290/adventure-time", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/1/4898.jpg" },
  tv_legacy_cheers: { localPath: "./assets/artwork/library/tv_legacy_cheers.jpg", source: "tvmaze", sourceId: 553, sourcePage: "https://www.tvmaze.com/shows/553/cheers", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/495/1238129.jpg" },
  tv_legacy_frasier: { localPath: "./assets/artwork/library/tv_legacy_frasier.jpg", source: "tvmaze", sourceId: 540, sourcePage: "https://www.tvmaze.com/shows/540/frasier", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/611/1528088.jpg" },
  tv_legacy_king_of_the_hill: { localPath: "./assets/artwork/library/tv_legacy_king_of_the_hill.jpg", source: "tvmaze", sourceId: 115, sourcePage: "https://www.tvmaze.com/shows/115/king-of-the-hill", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/633/1583514.jpg" },
  tv_legacy_bobs_burgers: { localPath: "./assets/artwork/library/tv_legacy_bobs_burgers.jpg", source: "tvmaze", sourceId: 107, sourcePage: "https://www.tvmaze.com/shows/107/bobs-burgers", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/589/1474468.jpg" },
  tv_legacy_american_dad: { localPath: "./assets/artwork/library/tv_legacy_american_dad.jpg", source: "tvmaze", sourceId: 215, sourcePage: "https://www.tvmaze.com/shows/215/american-dad", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/611/1528249.jpg" },
  tv_legacy_beavis_and_butt_head: { localPath: "./assets/artwork/library/tv_legacy_beavis_and_butt_head.jpg", source: "tvmaze", sourceId: 910, sourcePage: "https://www.tvmaze.com/shows/910/beavis-and-butt-head", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/6/16043.jpg" },
  tv_legacy_the_simpsons: { localPath: "./assets/artwork/library/tv_legacy_the_simpsons.jpg", source: "tvmaze", sourceId: 83, sourcePage: "https://www.tvmaze.com/shows/83/the-simpsons", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/637/1594614.jpg" },
  tv_legacy_that_70s_show: { localPath: "./assets/artwork/library/tv_legacy_that_70s_show.jpg", source: "tvmaze", sourceId: 587, sourcePage: "https://www.tvmaze.com/shows/587/that-70s-show", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/4/11921.jpg" },
  tv_legacy_scrubs: { localPath: "./assets/artwork/library/tv_legacy_scrubs.jpg", source: "tvmaze", sourceId: 532, sourcePage: "https://www.tvmaze.com/shows/532/scrubs", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/4/11371.jpg" },
  tv_legacy_the_office_us: { localPath: "./assets/artwork/library/tv_legacy_the_office_us.jpg", source: "tvmaze", sourceId: 526, sourcePage: "https://www.tvmaze.com/shows/526/the-office", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/481/1204342.jpg" },
  tv_legacy_star_trek_tng: { localPath: "./assets/artwork/library/tv_legacy_star_trek_tng.jpg", source: "tvmaze", sourceId: 491, sourcePage: "https://www.tvmaze.com/shows/491/star-trek-the-next-generation", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/496/1242352.jpg" },
  tv_legacy_the_fairly_oddparents: { localPath: "./assets/artwork/library/tv_legacy_the_fairly_oddparents.jpg", source: "tvmaze", sourceId: 2565, sourcePage: "https://www.tvmaze.com/shows/2565/the-fairly-oddparents", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/402/1006095.jpg" },
  tv_legacy_family_guy: { localPath: "./assets/artwork/library/tv_legacy_family_guy.jpg", source: "tvmaze", sourceId: 84, sourcePage: "https://www.tvmaze.com/shows/84/family-guy", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/609/1523259.jpg" },
  tv_legacy_robot_chicken: { localPath: "./assets/artwork/library/tv_legacy_robot_chicken.jpg", source: "tvmaze", sourceId: 686, sourcePage: "https://www.tvmaze.com/shows/686/robot-chicken", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/587/1468712.jpg" },
  tv_legacy_malcolm_in_the_middle: { localPath: "./assets/artwork/library/tv_legacy_malcolm_in_the_middle.jpg", source: "tvmaze", sourceId: 568, sourcePage: "https://www.tvmaze.com/shows/568/malcolm-in-the-middle", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/549/1373492.jpg" },
  tv_legacy_hunter_x_hunter_2011: { localPath: "./assets/artwork/library/tv_legacy_hunter_x_hunter_2011.jpg", source: "tvmaze", sourceId: 1536, sourcePage: "https://www.tvmaze.com/shows/1536/hunter-x-hunter", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/223/559165.jpg" },
  tv_legacy_the_fresh_prince_of_bel_air: { localPath: "./assets/artwork/library/tv_legacy_the_fresh_prince_of_bel_air.jpg", source: "tvmaze", sourceId: 582, sourcePage: "https://www.tvmaze.com/shows/582/the-fresh-prince-of-bel-air", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/4/11889.jpg" },
  tv_legacy_3rd_rock_from_the_sun: { localPath: "./assets/artwork/library/tv_legacy_3rd_rock_from_the_sun.jpg", source: "tvmaze", sourceId: 1053, sourcePage: "https://www.tvmaze.com/shows/1053/3rd-rock-from-the-sun", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/6/16980.jpg" },
  tv_legacy_aqua_teen_hunger_force: { localPath: "./assets/artwork/library/tv_legacy_aqua_teen_hunger_force.jpg", source: "tvmaze", sourceId: 382, sourcePage: "https://www.tvmaze.com/shows/382/aqua-teen-hunger-force", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/78/196672.jpg" },
  tv_legacy_sanford_and_son: { localPath: "./assets/artwork/library/tv_legacy_sanford_and_son.jpg", source: "tvmaze", sourceId: 7513, sourcePage: "https://www.tvmaze.com/shows/7513/sanford-and-son", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/27/69158.jpg" },
  tv_legacy_catdog: { localPath: "./assets/artwork/library/tv_legacy_catdog.jpg", source: "tvmaze", sourceId: 12449, sourcePage: "https://www.tvmaze.com/shows/12449/catdog", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/42/106385.jpg" },
  tv_legacy_recess: { localPath: "./assets/artwork/library/tv_legacy_recess.jpg", source: "tvmaze", sourceId: 5935, sourcePage: "https://www.tvmaze.com/shows/5935/recess", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/23/58538.jpg" },
  tv_legacy_ed_edd_n_eddy: { localPath: "./assets/artwork/library/tv_legacy_ed_edd_n_eddy.jpg", source: "tvmaze", sourceId: 6428, sourcePage: "https://www.tvmaze.com/shows/6428/ed-edd-n-eddy", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/24/61412.jpg" },
  tv_legacy_parks_and_recreation: { localPath: "./assets/artwork/library/tv_legacy_parks_and_recreation.jpg", source: "tvmaze", sourceId: 174, sourcePage: "https://www.tvmaze.com/shows/174/parks-and-recreation", sourceUrl: "https://static.tvmaze.com/uploads/images/original_untouched/481/1204341.jpg" }
};

export function applyBundledArtwork() {
  const missing = Object.entries(bundledArtwork).filter(([id]) => getState().items[id] && !getState().items[id].artwork);
  const titleCleanup = Object.values(getState().items).filter(item => item.wing === "tv" && /\s*▸\s*$/.test(item.title || ""));
  if (!missing.length && !titleCleanup.length) return 0;
  update(save => {
    for (const [id, artwork] of missing) save.items[id].artwork = typeof artwork === "string" ? artwork : structuredClone(artwork);
    for (const item of titleCleanup) save.items[item.id].title = item.title.replace(/\s*▸\s*$/, "");
    save.metadata.bundledArtwork = {
      appliedAt: new Date().toISOString(),
      source: "verified_local_and_tvmaze_covers",
      count: missing.length,
      legacyTitleGlyphsRemoved: titleCleanup.length
    };
  });
  return missing.length + titleCleanup.length;
}
