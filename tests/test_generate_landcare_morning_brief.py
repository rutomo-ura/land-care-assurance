import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "generate_landcare_morning_brief.py"


def write_snapshot(directory: Path, *, submissions=100, returned=20, active=80, missing=60, contractors=None):
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "refresh_manifest.json").write_text(json.dumps({"generated_on": "2026-07-14", "survey_submission_count": submissions}))
    (directory / "latest_month_summary.json").write_text(
        json.dumps(
            {
                "latest_month": "2026-06",
                "latest_assignment_period": "2026-07-15",
                "latest_survey_period": "2026-06-15",
                "status_counts": {"returned": returned, "missing": missing},
                "level_counts": {"Active": active},
                "contractor_returned": contractors or {"KRJ Enterprises": returned},
            }
        )
    )


class MorningBriefTests(unittest.TestCase):
    def generate(self, current: Path, previous: Path | None = None) -> str:
        output = current.parent / "brief.md"
        command = [sys.executable, str(SCRIPT), "--current-dir", str(current), "--output", str(output), "--date", "2026-07-14"]
        if previous:
            command.extend(["--previous-dir", str(previous)])
        subprocess.run(command, check=True, capture_output=True, text=True)
        return output.read_text(encoding="utf-8")

    def test_reports_movement_and_contributor(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            previous, current = root / "previous", root / "current"
            write_snapshot(previous, submissions=100, returned=20, active=80, missing=60, contractors={"KRJ Enterprises": 20})
            write_snapshot(current, submissions=105, returned=23, active=80, missing=57, contractors={"KRJ Enterprises": 22, "Hilltop Rising": 1})
            brief = self.generate(current, previous)
            self.assertIn("movement detected", brief)
            self.assertIn("New raw survey submissions:** +5", brief)
            self.assertIn("New assignment-matched returns:** +3", brief)
            self.assertIn("Active completion:** 28.7% (+3.7 pp", brief)
            self.assertIn("KRJ Enterprises:** +2", brief)
            self.assertIn("Hilltop Rising:** +1", brief)

    def test_reports_no_material_movement(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            previous, current = root / "previous", root / "current"
            write_snapshot(previous)
            write_snapshot(current)
            brief = self.generate(current, previous)
            self.assertIn("no material movement", brief)
            self.assertIn("No contractor gained", brief)

    def test_first_brief_establishes_baseline(self):
        with tempfile.TemporaryDirectory() as temp:
            current = Path(temp) / "current"
            write_snapshot(current)
            brief = self.generate(current)
            self.assertIn("baseline established", brief)
            self.assertIn("daily movement will begin", brief)

    def test_invalid_metric_file_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            current = Path(temp) / "current"
            current.mkdir()
            (current / "refresh_manifest.json").write_text("{}")
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--current-dir", str(current), "--output", str(current / "brief.md")],
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Missing required metric file", result.stderr)


if __name__ == "__main__":
    unittest.main()
