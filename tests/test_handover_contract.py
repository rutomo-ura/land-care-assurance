import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class HandoverContractTests(unittest.TestCase):
    def test_handover_entrypoints_and_design_system_brief_exist(self):
        for relative in ("HANDOVER.md", "AGENTS.md", "docs/github-handover-runbook.md", "docs/design-system/agent-brief.md"):
            self.assertTrue((ROOT / relative).is_file(), relative)

    def test_cutover_workflow_has_runtime_notification_configuration(self):
        workflow = (ROOT / ".github/workflows/landcare-morning-brief.yml").read_text(encoding="utf-8")
        self.assertIn("vars.LANDCARE_EMAIL_RECIPIENTS", workflow)
        self.assertIn("vars.LANDCARE_ISSUE_ASSIGNEE", workflow)
        self.assertIn("delivery_mode", workflow)
        self.assertIn("landcare-morning-brief-dry-run", workflow)

    def test_portable_design_system_has_no_required_font_import(self):
        css = (ROOT / "docs/design-system/executive-bi.css").read_text(encoding="utf-8-sig")
        self.assertNotIn("@import", css)
        self.assertIn("--bi-font-sans", css)

    def test_automation_defaults_do_not_include_departing_recipient(self):
        script = (ROOT / "scripts/send_landcare_executive_email.py").read_text(encoding="utf-8")
        self.assertIn('DEFAULT_RECIPIENTS = ""', script)
        self.assertNotIn("rutomo@ura.org", script)


if __name__ == "__main__":
    unittest.main()
