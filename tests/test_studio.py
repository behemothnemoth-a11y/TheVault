"""Novel Studio core, checked against the contract's acceptance baseline (§55).

Each test names the acceptance item it proves. Items belonging to later phases —
source import, threads, branches, the AI layer — are not tested here yet.
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from studio_core import CHAPTER_STATES, StudioError, StudioStore  # noqa: E402


class StudioCoreTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.store = StudioStore(self.folder.name)
        self.project = self.store.create_project("Endless Seas", mode="adaptation", premise="A sea story.")
        self.pid = self.project["id"]
        self.book = self.store.add_book(self.pid, "Book One", series_title="Endless Seas")
        self.chapter = self.store.add_chapter(self.pid, self.book["id"], "The Harbour")
        self.cid = self.chapter["id"]

    def tearDown(self):
        self.folder.cleanup()

    # -- helpers ---------------------------------------------------------------

    def walk_to(self, target, body="The tide came in slowly."):
        """Advance a chapter one legal step at a time, satisfying each precondition."""
        self.store.update_chapter_text(self.pid, self.cid, "proposal", {"purpose": "Arrival", "what_happens": "She arrives."})
        if not self.store.get_chapter(self.pid, self.cid)["scenes"]:
            self.store.add_scene(self.pid, self.cid, "Arrival at the pier")
        self.store.save_draft(self.pid, self.cid, body)
        while self.store.get_chapter(self.pid, self.cid)["state"] != target:
            current = self.store.get_chapter(self.pid, self.cid)["state"]
            self.store.transition(self.pid, self.cid, CHAPTER_STATES[CHAPTER_STATES.index(current) + 1])

    def lock(self, body="The tide came in slowly.\n\nShe did not look back."):
        self.walk_to("FINAL_REVIEW", body)
        return self.store.lock_chapter(self.pid, self.cid, why="Final")

    # -- §43 the chapter state machine -----------------------------------------

    def test_cannot_silently_jump_forward(self):
        """§43: normal UI cannot silently jump forward."""
        self.store.update_chapter_text(self.pid, self.cid, "proposal", {"purpose": "Arrival"})
        with self.assertRaises(StudioError):
            self.store.transition(self.pid, self.cid, "SCENE_PLAN_APPROVED")
        self.assertEqual(self.store.get_chapter(self.pid, self.cid)["state"], "UNPLANNED")

    def test_explicit_override_is_allowed_and_recorded(self):
        """§43: the user may explicitly override — and it goes on record."""
        with self.assertRaises(StudioError):  # an override without a reason is refused
            self.store.transition(self.pid, self.cid, "WRITE_READY", override=True)
        self.store.transition(self.pid, self.cid, "WRITE_READY", override=True, why="Pantser chapter")
        self.assertEqual(self.store.get_chapter(self.pid, self.cid)["state"], "WRITE_READY")
        self.assertEqual(self.store.decisions(self.pid)[0]["kind"], "STATE_OVERRIDE")

    def test_preconditions_block_empty_stages(self):
        with self.assertRaises(StudioError):
            self.store.transition(self.pid, self.cid, "PROPOSED")  # empty proposal

    def test_going_back_over_approved_work_reopens_it(self):
        self.walk_to("SCENE_PLANNED")
        self.store.transition(self.pid, self.cid, "PROPOSED", why="Rethinking the arrival")
        chapter = self.store.get_chapter(self.pid, self.cid)
        self.assertTrue(chapter["reopened"])
        self.assertEqual(chapter["proposalAuthority"], "WORKING")

    def test_editing_an_approved_proposal_withdraws_the_approval(self):
        self.walk_to("PROPOSAL_APPROVED")
        self.assertEqual(self.store.get_chapter(self.pid, self.cid)["proposalAuthority"], "APPROVED")
        self.store.update_chapter_text(self.pid, self.cid, "proposal", {"purpose": "A different arrival"})
        self.assertEqual(self.store.get_chapter(self.pid, self.cid)["proposalAuthority"], "WORKING")

    # -- §55 #28 / §33 locked text -----------------------------------------------

    def test_locked_text_survives_byte_for_byte(self):
        """#28: Locked Text survives unrelated revision byte-for-byte."""
        body = "The tide came in slowly.\n\n  Two spaces, a tab\there, and an em dash — kept."
        chapter = self.lock(body)
        # Anything that would change the text is refused while locked.
        with self.assertRaises(StudioError):
            self.store.save_draft(self.pid, self.cid, "rewritten")
        with self.assertRaises(StudioError):
            self.store.update_chapter_text(self.pid, self.cid, "proposal", {"purpose": "changed"})
        # And the stored text is provably identical.
        self.assertEqual(self.store.get_version(self.pid, self.cid, chapter["lock"]["versionId"])["body"], body)
        self.assertTrue(self.store.verify_lock(self.pid, self.cid)["intact"])

    def test_locked_version_file_cannot_be_overwritten(self):
        chapter = self.lock()
        version_path = (Path(self.folder.name) / "projects" / self.pid / "versions" / self.cid
                        / (chapter["lock"]["versionId"] + ".json"))
        with self.assertRaises(FileExistsError):
            with open(version_path, "x", encoding="utf-8") as handle:
                handle.write("{}")

    def test_lock_only_from_final_review(self):
        self.walk_to("REVISED")
        with self.assertRaises(StudioError):
            self.store.lock_chapter(self.pid, self.cid)

    def test_transition_cannot_be_used_to_lock(self):
        self.walk_to("FINAL_REVIEW")
        with self.assertRaises(StudioError):
            self.store.transition(self.pid, self.cid, "LOCKED", override=True, why="shortcut")

    # -- #29 locked facts --------------------------------------------------------

    def test_locked_fact_survives_prose_rewrite(self):
        """#29: Locked Fact survives prose rewrite."""
        fact = self.store.add_fact(self.pid, "Mara's father drowned off the north pier.", authority="LOCKED_FACT")
        self.walk_to("FIRST_DRAFT", "Version one of the prose.")
        self.store.save_draft(self.pid, self.cid, "Completely rewritten prose.")
        facts = self.store.get_project(self.pid)["facts"]
        self.assertEqual(facts[0]["statement"], fact["statement"])
        self.assertEqual(facts[0]["authority"], "LOCKED_FACT")
        with self.assertRaises(StudioError):
            self.store.change_fact(self.pid, fact["id"], statement="He drowned off the south pier.")

    def test_unlocking_a_fact_needs_a_reason(self):
        fact = self.store.add_fact(self.pid, "The lighthouse is abandoned.", authority="LOCKED_FACT")
        with self.assertRaises(StudioError):
            self.store.change_fact(self.pid, fact["id"], authority="APPROVED")
        self.store.change_fact(self.pid, fact["id"], authority="APPROVED", why="Keeper returns in book two")
        self.store.change_fact(self.pid, fact["id"], statement="The lighthouse is kept by one man.")
        self.assertEqual(self.store.get_project(self.pid)["facts"][0]["statement"], "The lighthouse is kept by one man.")

    def test_lock_can_register_locked_facts(self):
        self.walk_to("FINAL_REVIEW")
        self.store.lock_chapter(self.pid, self.cid, why="Final", facts=["Mara arrives in autumn."])
        project = self.store.get_project(self.pid)
        self.assertEqual(project["facts"][0]["authority"], "LOCKED_FACT")
        self.assertEqual(project["facts"][0]["chapterId"], self.cid)

    # -- #30 / §41 rejected material --------------------------------------------

    def test_rejected_material_is_recorded(self):
        """#30 groundwork: rejection is persisted, with its reason, so it cannot quietly return."""
        self.store.reject(self.pid, "Mara and the harbourmaster fall in love", why="Too fast", may_reconsider=False)
        project = self.store.get_project(self.pid)
        self.assertEqual(project["rejected"][0]["summary"], "Mara and the harbourmaster fall in love")
        self.assertFalse(project["rejected"][0]["mayReconsider"])
        self.assertEqual(self.store.decisions(self.pid)[0]["kind"], "REJECTED")

    # -- #39 / #40 stale and scoped reopening ------------------------------------

    def test_stale_never_deletes_content(self):
        """#39: STALE does not automatically delete or regenerate content."""
        self.walk_to("FIRST_DRAFT", "Draft text that must survive.")
        self.store.mark_stale(self.pid, self.cid, "Chapter 3 changed the relationship state")
        chapter = self.store.get_chapter(self.pid, self.cid)
        self.assertIsNotNone(chapter["stale"])
        self.assertEqual(chapter["draft"]["body"], "Draft text that must survive.")
        self.assertEqual(chapter["state"], "FIRST_DRAFT")

    def test_reopening_one_chapter_does_not_unlock_the_book(self):
        """#40: reopening one scene does not globally unlock a book."""
        self.lock()
        second = self.store.add_chapter(self.pid, self.book["id"], "The Lighthouse")
        first_id = self.cid
        self.cid = second["id"]
        self.lock("A second locked chapter.")
        self.store.reopen_chapter(self.pid, first_id, why="Moving the storm earlier")
        self.assertEqual(self.store.get_chapter(self.pid, first_id)["state"], "FINAL_REVIEW")
        self.assertEqual(self.store.get_chapter(self.pid, second["id"])["state"], "LOCKED")
        self.assertTrue(self.store.verify_lock(self.pid, second["id"])["intact"])

    def test_reopen_keeps_the_locked_version(self):
        """#58 at chapter scope: an earlier locked text stays recoverable after later work."""
        body = "Locked wording."
        chapter = self.lock(body)
        self.store.reopen_chapter(self.pid, self.cid, why="Revisit")
        self.store.save_draft(self.pid, self.cid, "New wording after reopening.")
        self.assertEqual(self.store.get_version(self.pid, self.cid, chapter["lock"]["versionId"])["body"], body)

    # -- #55 the running manuscript ----------------------------------------------

    def test_running_manuscript_excludes_unlocked_prose_by_default(self):
        """#55: running locked manuscript excludes unlocked prose by default."""
        self.lock("Locked chapter one.")
        unlocked = self.store.add_chapter(self.pid, self.book["id"], "Unfinished")
        self.store.save_draft(self.pid, unlocked["id"], "Draft prose that is not canon yet.")
        default = self.store.manuscript(self.pid, self.book["id"])
        self.assertEqual(default["chapters"][0]["body"], "Locked chapter one.")
        self.assertIsNone(default["chapters"][1]["body"])
        self.assertTrue(default["chapters"][1]["excluded"])
        included = self.store.manuscript(self.pid, self.book["id"], include_unlocked=True)
        self.assertEqual(included["chapters"][1]["body"], "Draft prose that is not canon yet.")
        self.assertTrue(included["chapters"][1]["unlocked"])

    # -- versions -----------------------------------------------------------------

    def test_restoring_a_version_keeps_the_draft_it_replaces(self):
        self.store.save_draft(self.pid, self.cid, "First wording.")
        first = self.store.create_version(self.pid, self.cid, note="first")
        self.store.save_draft(self.pid, self.cid, "Second wording.")
        self.store.restore_version(self.pid, self.cid, first["id"], why="Preferred the original")
        chapter = self.store.get_chapter(self.pid, self.cid)
        self.assertEqual(chapter["draft"]["body"], "First wording.")
        kept = [self.store.get_version(self.pid, self.cid, v["id"])["body"] for v in chapter["versions"]]
        self.assertIn("Second wording.", kept)

    def test_restoring_does_not_duplicate_wording_already_kept(self):
        self.store.save_draft(self.pid, self.cid, "First wording.")
        first = self.store.create_version(self.pid, self.cid, note="first")
        self.store.save_draft(self.pid, self.cid, "Second wording.")
        self.store.create_version(self.pid, self.cid, note="second")
        self.store.restore_version(self.pid, self.cid, first["id"])
        self.assertEqual(len(self.store.list_versions(self.pid, self.cid)), 2)

    # -- §52 NEXT -------------------------------------------------------------------

    def test_next_follows_workflow_state(self):
        self.assertEqual(self.store.orientation(self.pid)["next"], "Write the chapter proposal")
        self.walk_to("WRITE_READY")
        self.assertEqual(self.store.orientation(self.pid)["next"], "Write the first draft")
        self.store.transition(self.pid, self.cid, "FIRST_DRAFT")
        self.assertEqual(self.store.orientation(self.pid)["next"], "Do the first editorial read")

    def test_adaptation_project_without_chapters_is_not_a_dead_end(self):
        """NEXT must point at a step that exists today, not only at a later phase."""
        other = self.store.create_project("Second", mode="adaptation")
        book = self.store.add_book(other["id"], "Book One")
        orientation = self.store.orientation(other["id"])
        self.assertEqual(orientation["nextTarget"], {"type": "chapter", "bookId": book["id"]})

    def test_orientation_reports_what_is_blocking(self):
        orientation = self.store.orientation(self.pid)
        self.assertIn("proposal", orientation["blockedUntil"].lower())

    # -- §5 contract ----------------------------------------------------------------

    def test_locked_contract_rule_resists_rewording(self):
        self.store.set_contract(self.pid, "narration", "tense", "Past", authority="LOCKED_FACT")
        with self.assertRaises(StudioError):
            self.store.set_contract(self.pid, "narration", "tense", "Present", authority="LOCKED_FACT")
        with self.assertRaises(StudioError):  # unlocking is explicit: it needs a reason
            self.store.set_contract(self.pid, "narration", "tense", "Past", authority="WORKING")
        self.store.set_contract(self.pid, "narration", "tense", "Present", authority="WORKING", why="Experimenting")
        self.assertEqual(self.store.get_project(self.pid)["contract"]["narration"]["tense"]["value"], "Present")

    # -- #54 backup -----------------------------------------------------------------

    def test_export_contains_the_authoritative_state(self):
        """#54 groundwork: an export holds everything needed to restore the project."""
        self.lock("Exported text.")
        exported = json.loads(json.dumps(self.store.export_project(self.pid)))
        self.assertEqual(exported["project"]["id"], self.pid)
        self.assertEqual(exported["chapters"][0]["versions"][-1]["body"], "Exported text.")
        self.assertTrue(any(entry["kind"] == "LOCKED" for entry in exported["decisions"]))

    # -- safety -----------------------------------------------------------------------

    def test_ids_cannot_escape_the_studio_folder(self):
        for hostile in ("../../etc", "..\\..\\windows", "abc/def", ""):
            with self.assertRaises(StudioError):
                self.store.get_chapter(self.pid, hostile)


if __name__ == "__main__":
    unittest.main()
