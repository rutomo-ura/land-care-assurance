import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class HandoverContractTests(unittest.TestCase):
    def test_handover_entrypoints_and_design_system_brief_exist(self):
        for relative in (
            "HANDOVER.md",
            "AGENTS.md",
            "handover/04-readiness-checklist.md",
            "docs/github-handover-runbook.md",
            "docs/design-system/agent-brief.md",
            "docs/landcare-data-flow-architecture.png",
        ):
            self.assertTrue((ROOT / relative).is_file(), relative)

    def test_current_handover_declares_live_sources_and_deprecated_job(self):
        checklist = (ROOT / "handover/04-readiness-checklist.md").read_text(encoding="utf-8")
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        handover = (ROOT / "HANDOVER.md").read_text(encoding="utf-8")

        for content in (checklist, readme, handover):
            self.assertIn("7 AM", content)
            self.assertIn("deprecated", content.lower())
            self.assertIn("ArcGIS", content)

        self.assertIn("July 28, 2026", checklist)
        self.assertIn("Power BI", checklist)
        self.assertIn("04-readiness-checklist.md", readme)
        self.assertNotIn("Until the transfer window is complete", handover)

    def test_readiness_checklist_contains_no_secret_material(self):
        checklist = (ROOT / "handover/04-readiness-checklist.md").read_text(encoding="utf-8").lower()
        for marker in ("ghp_", "github_pat_", "begin private key", "password:"):
            self.assertNotIn(marker, checklist)

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

    def test_monitoring_uses_arcgis_gray_basemap_without_legacy_carto_tiles(self):
        script = (ROOT / "docs/landcare/monitoring.js").read_text(encoding="utf-8")
        self.assertIn('basemap: "gray-vector"', script)
        self.assertNotIn("basemaps.cartocdn.com", script)
        self.assertNotIn("API KEY", script)


if __name__ == "__main__":
    unittest.main()
