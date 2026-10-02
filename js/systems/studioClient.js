/* The Writing room's only way to reach Novel Studio.
 *
 * The rules — what may jump ahead, what a lock protects, what must carry a
 * reason — are enforced by the server's studio core, not here. This file just
 * carries requests and turns a refusal into a message the author can read.
 */

export class StudioRefusal extends Error {}

export async function studio(op, args = {}) {
  let response;
  try {
    response = await fetch("./__vault/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vault-Request": "studio" },
      body: JSON.stringify({ op, args }),
    });
  } catch {
    throw new StudioRefusal("The Vault server could not be reached. Your work is still on disk.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new StudioRefusal(payload.error || `The studio refused that (${response.status}).`);
  }
  return payload.result;
}

/* §43 — the chapter's primary path, mirrored for display only. The server
 * holds the authoritative list and the rules about moving along it. */
export const CHAPTER_STATES = [
  "UNPLANNED", "PROPOSED", "PROPOSAL_APPROVED", "SCENE_PLANNED", "SCENE_PLAN_APPROVED",
  "AUDITED", "WRITE_READY", "FIRST_DRAFT", "EDITORIAL_REVIEW", "REVISION_RESOLUTION",
  "REVISED", "FINAL_REVIEW", "LOCKED",
];

export const stateLabel = state => String(state || "").replace(/_/g, " ").toLowerCase()
  .replace(/^\w/, letter => letter.toUpperCase());

/* §5 — the project contract, grouped the way the contract document groups it. */
export const CONTRACT_SECTIONS = [
  ["identity", "Identity", ["title", "series", "book", "genre", "audience", "premise", "core_identity"]],
  ["narration", "Narration", ["pov", "tense", "narrative_distance", "voice", "viewpoint_restrictions"]],
  ["style", "Style", ["prose_rules", "tone", "description_policy", "symbolism_restraint", "rhetorical_preferences", "formatting"]],
  ["pacing", "Pacing", ["general_pace", "chapter_density", "ordinary_life", "action_compression", "emotional_recovery", "relationship_speed"]],
  ["dialogue", "Dialogue & humour", ["naturalism", "humor_density", "quip_restraint", "character_speech"]],
  ["mystery", "Mystery & information", ["evidence_discipline", "reveal_policy", "reader_knowledge", "character_knowledge", "ambiguity", "foreshadowing"]],
  ["world", "World", ["speculative_escalation", "technology", "violence", "rule_rigidity"]],
  ["relationships", "Relationships", ["romance", "intimacy_pacing", "boundaries"]],
  ["canon", "Canon", ["exact_dialogue", "hard_boundaries", "forbidden_tropes", "rejected_devices", "locked_character_rules"]],
  ["series", "Series", ["novel_endpoint", "series_intent", "later_book_material", "adaptation_priorities"]],
];

export const PROPOSAL_FIELDS = [
  ["purpose", "Chapter purpose"], ["what_happens", "What happens"], ["novel_time", "Novel time"],
  ["viewpoint", "Viewpoint"], ["primary_location", "Primary location"], ["starting_condition", "Starting condition"],
  ["character_movement", "Character movement"], ["relationship_movement", "Relationship movement"],
  ["conflict", "Conflict / pressure"], ["plot_movement", "Plot / mystery movement"],
  ["reader_promise_movement", "Reader promise / reveal movement"], ["world_work", "World / setting work"],
  ["competence_work", "Professional / competence work"], ["ordinary_life_work", "Ordinary-life work"],
  ["setup_payoff", "Setup / payoff"], ["threads_advanced", "Open threads advanced"],
  ["on_page_off_page", "On-page vs off-page"], ["temporal_notes", "Temporal notes"],
  ["pacing_notes", "Pacing notes"], ["chapter_ending", "Chapter ending"],
  ["concerns", "Story room concerns"], ["deliberately_does_not", "What this chapter deliberately does not do"],
];

export const MAP_FIELDS = [
  ["purpose", "Purpose"], ["novel_time", "Novel time"], ["pov", "Point of view"], ["primary_location", "Primary location"],
  ["starting_condition", "Starting condition"], ["ending_condition", "Ending condition"], ["major_events", "Major events"],
  ["character_movement", "Character movement"], ["relationship_movement", "Relationship movement"],
  ["conflict", "Conflict / pressure"], ["mystery_movement", "Mystery movement"],
  ["reader_promise_movement", "Reader promise movement"], ["world_function", "World function"],
  ["competence_movement", "Competence movement"], ["setup", "Setup"], ["payoff", "Payoff"],
  ["open_threads", "Open threads"], ["dependencies", "Dependencies"],
  ["downstream_consequences", "Downstream consequences"], ["experience_risks", "Narrative experience risks"],
];

export const SCENE_FIELDS = [
  ["purpose", "Scene purpose"], ["location", "Location"], ["time", "Time"], ["pov", "POV"],
  ["participants", "Participants"], ["opening_condition", "Opening condition"], ["entering_state", "Entering character state"],
  ["what_changes", "What changes"], ["key_action", "Key action / movement"], ["dialogue_topics", "Important dialogue topics"],
  ["emotional_movement", "Emotional movement"], ["decisions", "Character decisions"],
  ["behavior_to_protect", "Character behaviour to protect"], ["relationship_movement", "Relationship movement"],
  ["conflict", "Conflict / pressure"], ["required_facts", "Required facts"], ["forbidden_facts", "Forbidden / premature facts"],
  ["thread_movement", "Thread movement"], ["sensory", "Visual / sensory opportunities"],
  ["world_details", "World / cultural details"], ["continuity", "Continuity details"],
  ["unresolved", "What remains unresolved"], ["must_not_overexplain", "What must not be overexplained"],
  ["scene_exit", "Scene exit"], ["transition", "Transition to next scene"],
];

const ACRONYMS = { pov: "POV" };
export const fieldLabel = key => ACRONYMS[key] || key.replace(/_/g, " ").replace(/^\w/, letter => letter.toUpperCase());
