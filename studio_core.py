"""NOVEL STUDIO — the narrative domain core.

Implements the Novel Core of the Novel Studio contract (v0.4) as a storage and
rules layer with no HTTP and no UI in it, so the contract's behaviour can be
tested directly and the host (vault_server.py) stays a thin adapter.

What lives here, by contract section:
  §2   author decision states
  §5   the project contract
  §18  series / book / movement structure
  §20+ chapter map, chapter proposal, scene plan (as author-editable records)
  §33  locking — Locked Text and Locked Facts
  §34  STALE and REOPENED as flags that never destroy content
  §41  decision history, including rejected material
  §43  the chapter state machine: no silent forward jumps
  §52  NEXT, derived from workflow state
  §61  manuscript versions and the running locked manuscript

Storage is one JSON file per object under data/studio/projects/<project>/.
Locked and saved versions are opened with mode "x", so the filesystem itself
refuses to overwrite one — Locked Text cannot be altered by any later write.

Standard library only, like the rest of the Vault.
"""

import hashlib
import json
import os
import re
import secrets
import threading
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Vocabulary from the contract
# ---------------------------------------------------------------------------

MODES = ("original", "adaptation")

# §2 — authority an object can carry.
AUTHORITY = ("LOCKED_TEXT", "LOCKED_FACT", "APPROVED", "WORKING", "OPEN",
             "REJECTED", "SUPERSEDED", "DEFERRED", "STALE", "REOPENED")

# §43 — the chapter's primary path, in order.
CHAPTER_STATES = (
    "UNPLANNED", "PROPOSED", "PROPOSAL_APPROVED", "SCENE_PLANNED", "SCENE_PLAN_APPROVED",
    "AUDITED", "WRITE_READY", "FIRST_DRAFT", "EDITORIAL_REVIEW", "REVISION_RESOLUTION",
    "REVISED", "FINAL_REVIEW", "LOCKED",
)

# §44 — the book's primary path.
BOOK_STATES = (
    "ARCHITECTING", "CHAPTER_PRODUCTION", "COMPLETE_DRAFT", "DEVELOPMENTAL_REVIEW",
    "DEVELOPMENTAL_REVISION", "CONTINUITY_REVEAL_REVIEW", "LINE_COPY_EDIT",
    "PROOF_READY", "PROOFING", "BOOK_LOCKED", "EDITION_EXPORTED",
)

# §5 — the project contract, section by section. Every field starts OPEN.
CONTRACT_SECTIONS = {
    "identity": ("title", "series", "book", "genre", "audience", "premise", "core_identity"),
    "narration": ("pov", "tense", "narrative_distance", "voice", "viewpoint_restrictions"),
    "style": ("prose_rules", "tone", "description_policy", "symbolism_restraint", "rhetorical_preferences", "formatting"),
    "pacing": ("general_pace", "chapter_density", "ordinary_life", "action_compression", "emotional_recovery", "relationship_speed"),
    "dialogue": ("naturalism", "humor_density", "quip_restraint", "character_speech"),
    "mystery": ("evidence_discipline", "reveal_policy", "reader_knowledge", "character_knowledge", "ambiguity", "foreshadowing"),
    "world": ("speculative_escalation", "technology", "violence", "rule_rigidity"),
    "relationships": ("romance", "intimacy_pacing", "boundaries"),
    "canon": ("exact_dialogue", "hard_boundaries", "forbidden_tropes", "rejected_devices", "locked_character_rules"),
    "series": ("novel_endpoint", "series_intent", "later_book_material", "adaptation_priorities"),
}

# §20 — chapter map fields; §21 — proposal fields; §22 — scene plan fields.
CHAPTER_MAP_FIELDS = (
    "novel_time", "pov", "primary_location", "purpose", "starting_condition", "ending_condition",
    "major_events", "character_movement", "relationship_movement", "conflict", "mystery_movement",
    "reader_promise_movement", "world_function", "competence_movement", "setup", "payoff",
    "open_threads", "dependencies", "downstream_consequences", "experience_risks",
)
PROPOSAL_FIELDS = (
    "novel_time", "viewpoint", "primary_location", "purpose", "starting_condition",
    "what_happens", "character_movement", "relationship_movement", "conflict", "plot_movement",
    "reader_promise_movement", "world_work", "competence_work", "ordinary_life_work",
    "setup_payoff", "threads_advanced", "on_page_off_page", "temporal_notes", "pacing_notes",
    "chapter_ending", "concerns", "deliberately_does_not",
)
SCENE_FIELDS = (
    "purpose", "location", "time", "pov", "participants", "opening_condition", "entering_state",
    "what_changes", "key_action", "dialogue_topics", "emotional_movement", "decisions",
    "behavior_to_protect", "relationship_movement", "conflict", "required_facts",
    "forbidden_facts", "thread_movement", "sensory", "world_details", "continuity",
    "unresolved", "must_not_overexplain", "scene_exit", "transition",
)

# What each state is waiting on — the answer to "next" (§52).
NEXT_ACTION = {
    "UNPLANNED": "Write the chapter proposal",
    "PROPOSED": "Review the proposal, then approve or revise it",
    "PROPOSAL_APPROVED": "Plan the scenes",
    "SCENE_PLANNED": "Review the scene plan, then approve it",
    "SCENE_PLAN_APPROVED": "Run the pre-write audit",
    "AUDITED": "Mark the chapter write-ready",
    "WRITE_READY": "Write the first draft",
    "FIRST_DRAFT": "Do the first editorial read",
    "EDITORIAL_REVIEW": "Resolve the revision items",
    "REVISION_RESOLUTION": "Produce the revised draft",
    "REVISED": "Do the second full read",
    "FINAL_REVIEW": "Final polish, then lock the chapter",
    "LOCKED": "Move to the next chapter",
}

ID_PATTERN = re.compile(r"^[a-z0-9]{12,40}$")


class StudioError(Exception):
    """A request the contract does not allow. The message is safe to show the author."""


# ---------------------------------------------------------------------------
# Small utilities
# ---------------------------------------------------------------------------

def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id():
    return secrets.token_hex(8)


def word_count(text):
    return len(re.findall(r"\S+", text or ""))


def text_hash(text):
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def clean(value, limit=20000):
    return str(value if value is not None else "").replace("\x00", "")[:limit]


def check_id(value, what="id"):
    value = str(value or "")
    if not ID_PATTERN.fullmatch(value):
        raise StudioError("That {} is not valid.".format(what))
    return value


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".{}.tmp".format(os.getpid()))
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(temporary, path)


def write_once(path, data):
    """Create a file that can never be replaced. Raises if it already exists."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "x", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=1)


def read_json(path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


# ---------------------------------------------------------------------------
# The store
# ---------------------------------------------------------------------------

class StudioStore:
    def __init__(self, root):
        self.root = Path(root)
        self._locks = {}
        self._locks_guard = threading.Lock()

    # -- plumbing -----------------------------------------------------------

    def _lock(self, project_id):
        with self._locks_guard:
            return self._locks.setdefault(project_id, threading.RLock())

    def _dir(self, project_id):
        return self.root / "projects" / check_id(project_id, "project")

    def _project_path(self, project_id):
        return self._dir(project_id) / "project.json"

    def _chapter_path(self, project_id, chapter_id):
        return self._dir(project_id) / "chapters" / (check_id(chapter_id, "chapter") + ".json")

    def _draft_path(self, project_id, chapter_id):
        return self._dir(project_id) / "drafts" / (check_id(chapter_id, "chapter") + ".json")

    def _versions_dir(self, project_id, chapter_id):
        return self._dir(project_id) / "versions" / check_id(chapter_id, "chapter")

    def _load_project(self, project_id):
        project = read_json(self._project_path(project_id))
        if not project:
            raise StudioError("That project does not exist.")
        return project

    def _save_project(self, project):
        project["updatedAt"] = now()
        atomic_write(self._project_path(project["id"]), project)

    def _load_chapter(self, project_id, chapter_id):
        chapter = read_json(self._chapter_path(project_id, chapter_id))
        if not chapter:
            raise StudioError("That chapter does not exist.")
        return chapter

    def _save_chapter(self, project_id, chapter):
        chapter["updatedAt"] = now()
        atomic_write(self._chapter_path(project_id, chapter["id"]), chapter)

    def _decide(self, project_id, **record):
        """§2 / §41 — append to the decision history. Never rewritten."""
        entry = {
            "id": new_id(), "at": now(),
            "kind": clean(record.get("kind"), 40),
            "objectType": clean(record.get("objectType"), 30),
            "objectId": clean(record.get("objectId"), 40),
            "old": record.get("old"), "new": record.get("new"),
            "why": clean(record.get("why"), 2000),
            "authority": clean(record.get("authority") or "AUTHOR", 30),
            "scope": clean(record.get("scope"), 200),
            "rejectedAlternatives": [clean(item, 500) for item in (record.get("rejectedAlternatives") or [])][:20],
            "mayReconsider": record.get("mayReconsider"),
        }
        path = self._dir(project_id) / "decisions.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
        return entry

    # -- projects -----------------------------------------------------------

    def list_projects(self):
        folder = self.root / "projects"
        if not folder.is_dir():
            return []
        found = []
        for path in folder.glob("*/project.json"):
            project = read_json(path)
            if not project:
                continue
            found.append({
                "id": project["id"], "title": project.get("title"), "mode": project.get("mode"),
                "premise": project.get("contract", {}).get("identity", {}).get("premise", {}).get("value", ""),
                "books": len(project.get("books", [])), "chapters": len(project.get("chapters", [])),
                "updatedAt": project.get("updatedAt"), "createdAt": project.get("createdAt"),
            })
        return sorted(found, key=lambda entry: entry.get("updatedAt") or "", reverse=True)

    def create_project(self, title, mode="original", premise=""):
        title = clean(title, 200).strip()
        if not title:
            raise StudioError("A project needs a title.")
        if mode not in MODES:
            raise StudioError("Mode must be original or adaptation.")
        project_id = new_id()
        contract = {section: {field: {"value": "", "authority": "OPEN"} for field in fields}
                    for section, fields in CONTRACT_SECTIONS.items()}
        contract["identity"]["title"] = {"value": title, "authority": "WORKING"}
        if premise.strip():
            contract["identity"]["premise"] = {"value": clean(premise, 4000).strip(), "authority": "WORKING"}
        project = {
            "id": project_id, "title": title, "mode": mode, "version": 1,
            "createdAt": now(), "updatedAt": now(),
            "contract": contract, "series": [], "books": [], "chapters": [],
            "facts": [], "rejected": [],
        }
        with self._lock(project_id):
            atomic_write(self._project_path(project_id), project)
            self._decide(project_id, kind="PROJECT_CREATED", objectType="project", objectId=project_id,
                         new={"title": title, "mode": mode})
        return project

    def get_project(self, project_id):
        return self._load_project(project_id)

    def rename_project(self, project_id, title, why=""):
        title = clean(title, 200).strip()
        if not title:
            raise StudioError("A project needs a title.")
        with self._lock(project_id):
            project = self._load_project(project_id)
            old = project["title"]
            project["title"] = title
            project["contract"]["identity"]["title"]["value"] = title
            self._save_project(project)
            self._decide(project_id, kind="RENAMED", objectType="project", objectId=project_id,
                         old=old, new=title, why=why)
        return project

    # -- §5 project contract --------------------------------------------------

    def set_contract(self, project_id, section, field, value, authority="WORKING", why=""):
        if section not in CONTRACT_SECTIONS or field not in CONTRACT_SECTIONS[section]:
            raise StudioError("That is not a contract field.")
        if authority not in ("OPEN", "WORKING", "APPROVED", "LOCKED_FACT", "DEFERRED"):
            raise StudioError("A contract rule can be open, working, approved, locked or deferred.")
        with self._lock(project_id):
            project = self._load_project(project_id)
            current = project["contract"][section][field]
            # A locked rule changes only when explicitly unlocked (§1).
            if current["authority"] == "LOCKED_FACT" and authority == "LOCKED_FACT" and clean(value) != current["value"]:
                raise StudioError("This rule is locked. Unlock it before changing its wording.")
            if current["authority"] == "LOCKED_FACT" and authority != "LOCKED_FACT" and not clean(why).strip():
                raise StudioError("Say why this locked rule is being unlocked.")
            new = {"value": clean(value, 8000), "authority": authority}
            if new == current:
                return project
            project["contract"][section][field] = new
            if section == "identity" and field == "title" and new["value"].strip():
                project["title"] = new["value"].strip()
            self._save_project(project)
            self._decide(project_id, kind="CONTRACT_CHANGED", objectType="contract",
                         objectId="{}.{}".format(section, field), old=current, new=new, why=why)
        return project

    # -- §18 structure --------------------------------------------------------

    def add_book(self, project_id, title, series_title=""):
        title = clean(title, 200).strip()
        if not title:
            raise StudioError("A book needs a title.")
        with self._lock(project_id):
            project = self._load_project(project_id)
            series_id = None
            if series_title.strip():
                series = next((entry for entry in project["series"] if entry["title"] == series_title.strip()), None)
                if not series:
                    series = {"id": new_id(), "title": clean(series_title, 200).strip()}
                    project["series"].append(series)
                series_id = series["id"]
            book = {
                "id": new_id(), "seriesId": series_id, "title": title,
                "number": len(project["books"]) + 1, "state": "ARCHITECTING",
                "openingState": "", "endingState": "", "movements": [], "createdAt": now(),
            }
            project["books"].append(book)
            self._save_project(project)
            self._decide(project_id, kind="BOOK_ADDED", objectType="book", objectId=book["id"], new=title)
        return book

    def add_movement(self, project_id, book_id, title, purpose=""):
        title = clean(title, 200).strip()
        if not title:
            raise StudioError("A movement needs a title.")
        with self._lock(project_id):
            project = self._load_project(project_id)
            book = self._book(project, book_id)
            movement = {"id": new_id(), "title": title, "purpose": clean(purpose, 2000)}
            book["movements"].append(movement)
            self._save_project(project)
            self._decide(project_id, kind="MOVEMENT_ADDED", objectType="movement", objectId=movement["id"], new=title)
        return movement

    def _book(self, project, book_id):
        book = next((entry for entry in project["books"] if entry["id"] == book_id), None)
        if not book:
            raise StudioError("That book does not exist.")
        return book

    def add_chapter(self, project_id, book_id, title, movement_id=None):
        title = clean(title, 200).strip() or "Untitled chapter"
        with self._lock(project_id):
            project = self._load_project(project_id)
            book = self._book(project, book_id)
            if movement_id and not any(entry["id"] == movement_id for entry in book["movements"]):
                raise StudioError("That movement is not in this book.")
            chapter_id = new_id()
            number = 1 + sum(1 for entry in project["chapters"] if entry["bookId"] == book_id)
            chapter = {
                "id": chapter_id, "bookId": book_id, "movementId": movement_id, "number": number,
                "title": title, "state": "UNPLANNED", "stale": None, "reopened": False,
                "map": {field: "" for field in CHAPTER_MAP_FIELDS},
                "proposal": {field: "" for field in PROPOSAL_FIELDS},
                "proposalAuthority": "OPEN", "sceneAuthority": "OPEN",
                "scenes": [], "lock": None, "lockedFacts": [],
                "createdAt": now(), "updatedAt": now(),
            }
            self._save_chapter(project_id, chapter)
            project["chapters"].append({"id": chapter_id, "bookId": book_id, "movementId": movement_id,
                                        "number": number, "title": title, "state": "UNPLANNED"})
            if book["state"] == "ARCHITECTING" and number == 1:
                pass  # the book stays in architecture until the author moves it on
            self._save_project(project)
            self._decide(project_id, kind="CHAPTER_ADDED", objectType="chapter", objectId=chapter_id, new=title)
        return chapter

    def _sync_index(self, project, chapter):
        """Keep the project's lightweight chapter index in step with the chapter file."""
        for entry in project["chapters"]:
            if entry["id"] == chapter["id"]:
                entry.update({"title": chapter["title"], "state": chapter["state"],
                              "movementId": chapter.get("movementId"),
                              "stale": bool(chapter.get("stale")), "reopened": chapter.get("reopened", False),
                              "locked": bool(chapter.get("lock"))})

    def get_chapter(self, project_id, chapter_id):
        chapter = self._load_chapter(project_id, chapter_id)
        draft = read_json(self._draft_path(project_id, chapter_id), {"body": "", "updatedAt": None})
        chapter["draft"] = {"body": draft.get("body", ""), "updatedAt": draft.get("updatedAt"),
                            "words": word_count(draft.get("body", ""))}
        chapter["versions"] = self.list_versions(project_id, chapter_id)
        return chapter

    def update_chapter_text(self, project_id, chapter_id, part, fields):
        """Edit the chapter map, proposal, or title. Approved material edited becomes WORKING again."""
        if part not in ("map", "proposal", "title"):
            raise StudioError("Only the map, the proposal or the title can be edited this way.")
        with self._lock(project_id):
            project = self._load_project(project_id)
            chapter = self._load_chapter(project_id, chapter_id)
            if chapter["state"] == "LOCKED":
                raise StudioError("This chapter is locked. Reopen it before changing it.")
            if part == "title":
                chapter["title"] = clean(fields.get("title"), 200).strip() or chapter["title"]
            else:
                allowed = CHAPTER_MAP_FIELDS if part == "map" else PROPOSAL_FIELDS
                for key, value in (fields or {}).items():
                    if key in allowed:
                        chapter[part][key] = clean(value, 8000)
                # Editing an approved proposal reopens it rather than silently
                # leaving an approval stamped on words the author never approved.
                if part == "proposal" and chapter["proposalAuthority"] == "APPROVED":
                    chapter["proposalAuthority"] = "WORKING"
                    if CHAPTER_STATES.index(chapter["state"]) >= CHAPTER_STATES.index("PROPOSAL_APPROVED"):
                        chapter["reopened"] = True
            self._save_chapter(project_id, chapter)
            self._sync_index(project, chapter)
            self._save_project(project)
        return self.get_chapter(project_id, chapter_id)

    # -- §22 scenes -----------------------------------------------------------

    def add_scene(self, project_id, chapter_id, purpose=""):
        with self._lock(project_id):
            project = self._load_project(project_id)
            chapter = self._load_chapter(project_id, chapter_id)
            if chapter["state"] == "LOCKED":
                raise StudioError("This chapter is locked. Reopen it before changing its scenes.")
            scene = {"id": new_id(), "number": len(chapter["scenes"]) + 1,
                     "plan": {field: "" for field in SCENE_FIELDS}, "createdAt": now()}
            scene["plan"]["purpose"] = clean(purpose, 4000)
            chapter["scenes"].append(scene)
            if chapter["sceneAuthority"] == "APPROVED":
                chapter["sceneAuthority"] = "WORKING"
            self._save_chapter(project_id, chapter)
            self._sync_index(project, chapter)
            self._save_project(project)
        return scene

    def update_scene(self, project_id, chapter_id, scene_id, fields):
        with self._lock(project_id):
            project = self._load_project(project_id)
            chapter = self._load_chapter(project_id, chapter_id)
            if chapter["state"] == "LOCKED":
                raise StudioError("This chapter is locked. Reopen it before changing its scenes.")
            scene = next((entry for entry in chapter["scenes"] if entry["id"] == scene_id), None)
            if not scene:
                raise StudioError("That scene does not exist.")
            for key, value in (fields or {}).items():
                if key in SCENE_FIELDS:
                    scene["plan"][key] = clean(value, 8000)
            if chapter["sceneAuthority"] == "APPROVED":
                chapter["sceneAuthority"] = "WORKING"
            self._save_chapter(project_id, chapter)
            self._sync_index(project, chapter)
            self._save_project(project)
        return scene

    def remove_scene(self, project_id, chapter_id, scene_id, why=""):
        with self._lock(project_id):
            project = self._load_project(project_id)
            chapter = self._load_chapter(project_id, chapter_id)
            if chapter["state"] == "LOCKED":
                raise StudioError("This chapter is locked. Reopen it before changing its scenes.")
            scene = next((entry for entry in chapter["scenes"] if entry["id"] == scene_id), None)
            if not scene:
                raise StudioError("That scene does not exist.")
            chapter["scenes"] = [entry for entry in chapter["scenes"] if entry["id"] != scene_id]
            for index, entry in enumerate(chapter["scenes"], 1):
                entry["number"] = index
            self._save_chapter(project_id, chapter)
            self._sync_index(project, chapter)
            self._save_project(project)
            # The plan is kept in the history, not simply deleted.
            self._decide(project_id, kind="SCENE_REMOVED", objectType="scene", objectId=scene_id,
                         old=scene["plan"], why=why)

    # -- §43 the state machine ------------------------------------------------

    def _precondition(self, chapter, target, draft_words):
        """What must be true before a chapter may enter a state. None if satisfied."""
        proposal = chapter["proposal"]
        if target == "PROPOSED" and not (proposal.get("purpose", "").strip() or proposal.get("what_happens", "").strip()):
            return "Give the proposal at least a purpose or what happens."
        if target == "SCENE_PLANNED" and not chapter["scenes"]:
            return "Plan at least one scene."
        if target == "FIRST_DRAFT" and draft_words == 0:
            return "There is no draft yet."
        if target == "LOCKED":
            return "Use lock to lock a chapter, so the text is preserved exactly."
        return None

    def transition(self, project_id, chapter_id, target, override=False, why=""):
        """Move a chapter through its states.

        One step forward is normal. Further than one step is a jump, and the
        interface cannot do it silently: it needs an explicit override with a
        reason, and the override goes in the decision history. Moving back is
        always allowed and marks approved work as reopened.
        """
        if target not in CHAPTER_STATES:
            raise StudioError("That is not a chapter state.")
        with self._lock(project_id):
            project = self._load_project(project_id)
            chapter = self._load_chapter(project_id, chapter_id)
            current = chapter["state"]
            if current == "LOCKED":
                raise StudioError("This chapter is locked. Reopen it to change its state.")
            if target == current:
                return self.get_chapter(project_id, chapter_id)
            here, there = CHAPTER_STATES.index(current), CHAPTER_STATES.index(target)
            draft_words = word_count(read_json(self._draft_path(project_id, chapter_id), {}).get("body", ""))

            if there > here:
                problem = self._precondition(chapter, target, draft_words)
                if problem and not (override and target != "LOCKED"):
                    raise StudioError(problem)
                if there > here + 1 and not override:
                    raise StudioError("That skips {} stage{}. Confirm the override to jump ahead.".format(
                        there - here - 1, "" if there - here - 1 == 1 else "s"))
                if override and not why.strip():
                    raise StudioError("An override needs a reason, so the jump is on record.")
            else:
                # Going back over approved work reopens it (§2, §43).
                if here >= CHAPTER_STATES.index("PROPOSAL_APPROVED"):
                    chapter["reopened"] = True

            # Approval stamps travel with the states that grant them.
            if target == "PROPOSAL_APPROVED":
                chapter["proposalAuthority"] = "APPROVED"
            elif there < CHAPTER_STATES.index("PROPOSAL_APPROVED") and chapter["proposalAuthority"] == "APPROVED":
                chapter["proposalAuthority"] = "WORKING"
            if target == "SCENE_PLAN_APPROVED":
                chapter["sceneAuthority"] = "APPROVED"
            elif there < CHAPTER_STATES.index("SCENE_PLAN_APPROVED") and chapter["sceneAuthority"] == "APPROVED":
                chapter["sceneAuthority"] = "WORKING"

            chapter["state"] = target
            self._save_chapter(project_id, chapter)
            self._sync_index(project, chapter)
            self._save_project(project)
            kind = "STATE_OVERRIDE" if (there > here + 1 or (override and there > here)) else (
                "STATE_BACK" if there < here else "STATE_ADVANCED")
            self._decide(project_id, kind=kind, objectType="chapter", objectId=chapter_id,
                         old=current, new=target, why=why)
        return self.get_chapter(project_id, chapter_id)

    # -- §34 stale / reopened -------------------------------------------------

    def mark_stale(self, project_id, chapter_id, reason):
        if not str(reason or "").strip():
            raise StudioError("Say why this chapter needs review.")
        with self._lock(project_id):
            project = self._load_project(project_id)
            chapter = self._load_chapter(project_id, chapter_id)
            # STALE flags for review. It never deletes or regenerates anything.
            chapter["stale"] = {"reason": clean(reason, 1000), "at": now()}
            self._save_chapter(project_id, chapter)
            self._sync_index(project, chapter)
            self._save_project(project)
            self._decide(project_id, kind="MARKED_STALE", objectType="chapter", objectId=chapter_id, why=reason)
        return self.get_chapter(project_id, chapter_id)

    def clear_stale(self, project_id, chapter_id, why=""):
        with self._lock(project_id):
            project = self._load_project(project_id)
            chapter = self._load_chapter(project_id, chapter_id)
            old = chapter.get("stale")
            chapter["stale"] = None
            self._save_chapter(project_id, chapter)
            self._sync_index(project, chapter)
            self._save_project(project)
            self._decide(project_id, kind="STALE_CLEARED", objectType="chapter", objectId=chapter_id, old=old, why=why)
        return self.get_chapter(project_id, chapter_id)

    # -- §61 drafts and versions ----------------------------------------------

    def save_draft(self, project_id, chapter_id, body):
        """The working copy. Autosaved often, so it is the one mutable file."""
        with self._lock(project_id):
            chapter = self._load_chapter(project_id, chapter_id)
            if chapter["state"] == "LOCKED":
                raise StudioError("This chapter is locked. Its text cannot change until it is reopened.")
            body = clean(body, 4_000_000)
            atomic_write(self._draft_path(project_id, chapter_id), {"body": body, "updatedAt": now()})
        return {"words": word_count(body), "savedAt": now()}

    def create_version(self, project_id, chapter_id, note="", kind="snapshot"):
        """Freeze the current draft as a version that can never be edited."""
        with self._lock(project_id):
            chapter = self._load_chapter(project_id, chapter_id)
            body = read_json(self._draft_path(project_id, chapter_id), {}).get("body", "")
            version = self._write_version(project_id, chapter, body, note, kind)
        return version

    def _write_version(self, project_id, chapter, body, note, kind):
        existing = self.list_versions(project_id, chapter["id"])
        version = {
            "id": new_id(), "chapterId": chapter["id"], "number": len(existing) + 1,
            "kind": kind, "state": chapter["state"], "note": clean(note, 1000),
            "parentId": existing[-1]["id"] if existing else None,
            "createdAt": now(), "words": word_count(body), "sha256": text_hash(body), "body": body,
        }
        write_once(self._versions_dir(project_id, chapter["id"]) / (version["id"] + ".json"), version)
        return version

    def list_versions(self, project_id, chapter_id):
        folder = self._versions_dir(project_id, chapter_id)
        if not folder.is_dir():
            return []
        versions = [read_json(path) for path in folder.glob("*.json")]
        versions = [entry for entry in versions if entry]
        versions.sort(key=lambda entry: (entry.get("number", 0), entry.get("createdAt", "")))
        # The listing leaves the text out; get_version reads it.
        return [{key: value for key, value in entry.items() if key != "body"} for entry in versions]

    def get_version(self, project_id, chapter_id, version_id):
        check_id(version_id, "version")
        version = read_json(self._versions_dir(project_id, chapter_id) / (version_id + ".json"))
        if not version:
            raise StudioError("That version does not exist.")
        return version

    def restore_version(self, project_id, chapter_id, version_id, why=""):
        """Bring an old version back as the working draft. The version itself is untouched."""
        with self._lock(project_id):
            chapter = self._load_chapter(project_id, chapter_id)
            if chapter["state"] == "LOCKED":
                raise StudioError("This chapter is locked. Reopen it before restoring older wording.")
            version = self.get_version(project_id, chapter_id, version_id)
            current = read_json(self._draft_path(project_id, chapter_id), {}).get("body", "")
            kept = {entry["sha256"] for entry in self.list_versions(project_id, chapter_id)}
            if current and text_hash(current) not in kept:
                # The draft being replaced is kept, so restoring is never a loss.
                # Wording already frozen in a version needs no second copy.
                self._write_version(project_id, chapter, current, "Kept before restoring version {}".format(version["number"]), "auto")
            atomic_write(self._draft_path(project_id, chapter_id), {"body": version["body"], "updatedAt": now()})
            self._decide(project_id, kind="VERSION_RESTORED", objectType="chapter", objectId=chapter_id,
                         new=version["number"], why=why)
        return self.get_chapter(project_id, chapter_id)

    # -- §33 locking ----------------------------------------------------------

    def lock_chapter(self, project_id, chapter_id, why="", facts=None):
        """Lock the chapter's text. The draft becomes a write-once version, and
        its hash is recorded so the lock can be proven intact later."""
        with self._lock(project_id):
            project = self._load_project(project_id)
            chapter = self._load_chapter(project_id, chapter_id)
            if chapter["state"] == "LOCKED":
                raise StudioError("This chapter is already locked.")
            if chapter["state"] != "FINAL_REVIEW":
                raise StudioError("A chapter locks from final review. It is at {}.".format(chapter["state"].replace("_", " ").lower()))
            body = read_json(self._draft_path(project_id, chapter_id), {}).get("body", "")
            if not body.strip():
                raise StudioError("There is no text to lock.")
            version = self._write_version(project_id, chapter, body, why or "Locked", "locked")
            chapter["lock"] = {"type": "LOCKED_TEXT", "versionId": version["id"], "sha256": version["sha256"],
                               "at": now(), "why": clean(why, 1000)}
            chapter["state"] = "LOCKED"
            chapter["reopened"] = False
            chapter["stale"] = None
            for statement in facts or []:
                statement = clean(statement, 1000).strip()
                if statement:
                    fact = {"id": new_id(), "statement": statement, "authority": "LOCKED_FACT",
                            "chapterId": chapter_id, "bookId": chapter["bookId"], "createdAt": now()}
                    project["facts"].append(fact)
                    chapter["lockedFacts"].append(fact["id"])
            self._save_chapter(project_id, chapter)
            self._sync_index(project, chapter)
            self._save_project(project)
            self._decide(project_id, kind="LOCKED", objectType="chapter", objectId=chapter_id,
                         new={"versionId": version["id"], "sha256": version["sha256"]}, why=why)
        return self.get_chapter(project_id, chapter_id)

    def reopen_chapter(self, project_id, chapter_id, why):
        """Scoped unlock (§33): this chapter only. Its locked version stays on record."""
        if not str(why or "").strip():
            raise StudioError("Say why this chapter is being reopened.")
        with self._lock(project_id):
            project = self._load_project(project_id)
            chapter = self._load_chapter(project_id, chapter_id)
            if chapter["state"] != "LOCKED":
                raise StudioError("Only a locked chapter can be reopened this way.")
            previous_lock = chapter["lock"]
            chapter["state"] = "FINAL_REVIEW"
            chapter["reopened"] = True
            chapter["lock"] = None
            chapter.setdefault("previousLocks", []).append(previous_lock)
            self._save_chapter(project_id, chapter)
            self._sync_index(project, chapter)
            self._save_project(project)
            self._decide(project_id, kind="REOPENED", objectType="chapter", objectId=chapter_id,
                         old=previous_lock, why=why, scope="chapter {}".format(chapter["number"]))
        return self.get_chapter(project_id, chapter_id)

    def verify_lock(self, project_id, chapter_id):
        """Prove a locked chapter's text is exactly what was locked."""
        chapter = self._load_chapter(project_id, chapter_id)
        if not chapter.get("lock"):
            return {"locked": False}
        version = self.get_version(project_id, chapter_id, chapter["lock"]["versionId"])
        intact = text_hash(version["body"]) == chapter["lock"]["sha256"] == version["sha256"]
        return {"locked": True, "intact": intact, "sha256": chapter["lock"]["sha256"]}

    # -- facts and rejected material ------------------------------------------

    def add_fact(self, project_id, statement, authority="APPROVED", chapter_id=None, why=""):
        statement = clean(statement, 1000).strip()
        if not statement:
            raise StudioError("A fact needs a statement.")
        if authority not in ("LOCKED_FACT", "APPROVED", "WORKING"):
            raise StudioError("A fact can be locked, approved or working.")
        with self._lock(project_id):
            project = self._load_project(project_id)
            fact = {"id": new_id(), "statement": statement, "authority": authority,
                    "chapterId": chapter_id, "createdAt": now()}
            project["facts"].append(fact)
            self._save_project(project)
            self._decide(project_id, kind="FACT_ADDED", objectType="fact", objectId=fact["id"], new=fact, why=why)
        return fact

    def change_fact(self, project_id, fact_id, statement=None, authority=None, why=""):
        with self._lock(project_id):
            project = self._load_project(project_id)
            fact = next((entry for entry in project["facts"] if entry["id"] == fact_id), None)
            if not fact:
                raise StudioError("That fact does not exist.")
            old = dict(fact)
            # A locked fact holds while the prose around it changes (§2). Its
            # statement changes only if it is first unlocked, on the record.
            if statement is not None and fact["authority"] == "LOCKED_FACT" and authority in (None, "LOCKED_FACT"):
                raise StudioError("This fact is locked. Change its authority first, with a reason.")
            if authority is not None:
                if authority not in ("LOCKED_FACT", "APPROVED", "WORKING", "SUPERSEDED", "REJECTED"):
                    raise StudioError("That is not a fact authority.")
                if fact["authority"] == "LOCKED_FACT" and authority != "LOCKED_FACT" and not why.strip():
                    raise StudioError("Unlocking a fact needs a reason.")
                fact["authority"] = authority
            if statement is not None:
                fact["statement"] = clean(statement, 1000).strip() or fact["statement"]
            self._save_project(project)
            self._decide(project_id, kind="FACT_CHANGED", objectType="fact", objectId=fact_id, old=old, new=dict(fact), why=why)
        return fact

    def reject(self, project_id, summary, why="", object_type="idea", may_reconsider=False):
        """§41 — rejected material is recorded so it cannot quietly come back."""
        summary = clean(summary, 2000).strip()
        if not summary:
            raise StudioError("Say what is being rejected.")
        with self._lock(project_id):
            project = self._load_project(project_id)
            entry = {"id": new_id(), "summary": summary, "why": clean(why, 2000), "objectType": clean(object_type, 30),
                     "mayReconsider": bool(may_reconsider), "at": now()}
            project["rejected"].append(entry)
            self._save_project(project)
            self._decide(project_id, kind="REJECTED", objectType=object_type, objectId=entry["id"],
                         new=summary, why=why, mayReconsider=bool(may_reconsider))
        return entry

    def decisions(self, project_id, limit=300):
        path = self._dir(project_id) / "decisions.jsonl"
        if not path.is_file():
            return []
        rows = []
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                rows.append(json.loads(line))
            except ValueError:
                continue
        return rows[-limit:][::-1]

    # -- §4 / §52 orientation and NEXT ----------------------------------------

    def orientation(self, project_id):
        project = self._load_project(project_id)
        contract_open = sum(1 for fields in project["contract"].values()
                            for field in fields.values() if field["authority"] == "OPEN")
        essentials = [("identity", "premise"), ("narration", "pov"), ("narration", "tense")]
        missing = [field for section, field in essentials
                   if project["contract"][section][field]["authority"] == "OPEN"]

        book = next((entry for entry in project["books"] if entry["state"] not in ("BOOK_LOCKED", "EDITION_EXPORTED")), None)
        chapters = [entry for entry in project["chapters"] if book and entry["bookId"] == book["id"]]
        current = next((entry for entry in chapters if entry["state"] != "LOCKED"), None)

        if not project["books"]:
            action, target = "Set up the first book", {"type": "book"}
        elif project["mode"] == "adaptation" and not chapters:
            # Source import is the adaptation workflow's real first step, but it
            # arrives next phase. Pointing only at it would be a dead end, so
            # the step that does exist today is offered alongside it.
            action = "Map the first chapter — source import arrives in the next phase"
            target = {"type": "chapter", "bookId": book["id"]}
        elif not chapters:
            action, target = "Map the first chapter", {"type": "chapter", "bookId": book["id"]}
        elif current is None:
            action, target = "Every chapter in this book is locked — begin whole-book review", {"type": "book", "bookId": book["id"]}
        else:
            action = NEXT_ACTION[current["state"]]
            target = {"type": "chapter", "id": current["id"]}

        blocked = None
        if current:
            chapter = self._load_chapter(project_id, current["id"])
            nxt = CHAPTER_STATES[min(CHAPTER_STATES.index(chapter["state"]) + 1, len(CHAPTER_STATES) - 1)]
            draft_words = word_count(read_json(self._draft_path(project_id, current["id"]), {}).get("body", ""))
            blocked = self._precondition(chapter, nxt, draft_words) if nxt != "LOCKED" else None

        locked = [entry for entry in project["chapters"] if entry["state"] == "LOCKED"]
        return {
            "mode": project["mode"],
            "book": {"id": book["id"], "title": book["title"], "state": book["state"]} if book else None,
            "chapter": current,
            "stage": current["state"] if current else (book["state"] if book else "SETUP"),
            "next": action, "nextTarget": target, "blockedUntil": blocked,
            "contractOpen": contract_open, "contractEssentialsMissing": missing,
            "stale": [entry for entry in project["chapters"] if entry.get("stale")],
            "reopened": [entry for entry in project["chapters"] if entry.get("reopened")],
            "latestLocked": locked[-1] if locked else None,
            "lockedFacts": sum(1 for fact in project["facts"] if fact["authority"] == "LOCKED_FACT"),
            "rejected": len(project["rejected"]),
        }

    # -- §61 the running manuscript -------------------------------------------

    def manuscript(self, project_id, book_id, include_unlocked=False):
        """The book as it stands. Locked text only, unless asked otherwise (§55)."""
        project = self._load_project(project_id)
        self._book(project, book_id)
        parts = []
        for entry in sorted((c for c in project["chapters"] if c["bookId"] == book_id), key=lambda c: c["number"]):
            chapter = self._load_chapter(project_id, entry["id"])
            if chapter.get("lock"):
                body = self.get_version(project_id, entry["id"], chapter["lock"]["versionId"])["body"]
                parts.append({"id": entry["id"], "number": entry["number"], "title": chapter["title"],
                              "status": "LOCKED", "words": word_count(body), "body": body})
            elif include_unlocked:
                body = read_json(self._draft_path(project_id, entry["id"]), {}).get("body", "")
                parts.append({"id": entry["id"], "number": entry["number"], "title": chapter["title"],
                              "status": chapter["state"], "words": word_count(body), "body": body, "unlocked": True})
            else:
                parts.append({"id": entry["id"], "number": entry["number"], "title": chapter["title"],
                              "status": chapter["state"], "words": 0, "body": None, "excluded": True})
        return {"bookId": book_id, "includeUnlocked": include_unlocked, "chapters": parts,
                "words": sum(part["words"] for part in parts)}

    # -- §49 backup -----------------------------------------------------------

    def export_project(self, project_id):
        """Everything needed to restore the project's authoritative state."""
        project = self._load_project(project_id)
        chapters = []
        for entry in project["chapters"]:
            chapter = self._load_chapter(project_id, entry["id"])
            chapter["draft"] = read_json(self._draft_path(project_id, entry["id"]), {"body": ""})
            chapter["versions"] = [self.get_version(project_id, entry["id"], v["id"])
                                   for v in self.list_versions(project_id, entry["id"])]
            chapters.append(chapter)
        return {"format": "novel-studio-export", "formatVersion": 1, "exportedAt": now(),
                "project": project, "chapters": chapters, "decisions": self.decisions(project_id, limit=100000)[::-1]}
