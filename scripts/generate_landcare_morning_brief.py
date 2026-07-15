"""Generate a concise, source-aware LandCare executive morning brief.

This program is deliberately transport-independent.  GitHub Actions uses the
Markdown output to create an Issue, while the same output can be inspected
locally without creating notifications.
"""

from __future__ import annotations

import argparse
import json
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo


REQUIRED_FILES = ("refresh_manifest.json", "latest_month_summary.json")
MAP_MONITOR_URL = "https://rutomo-ura.github.io/land-care-assurance/monitoring/"
KPI_DASHBOARD_URL = "https://rutomo-ura.github.io/land-care-assurance/kpi/"


def read_json(directory: Path, filename: str) -> dict:
    path = directory / filename
    if not path.is_file():
        raise ValueError(f"Missing required metric file: {filename}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in {filename}: {exc.msg}") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"Expected an object in {filename}")
    return payload


def number(value: object, key: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"Missing or invalid numeric metric: {key}")
    return int(value)


def metric_snapshot(directory: Path) -> dict:
    manifest = read_json(directory, "refresh_manifest.json")
    summary = read_json(directory, "latest_month_summary.json")
    status_counts = summary.get("status_counts")
    level_counts = summary.get("level_counts")
    contractor_returned = summary.get("contractor_returned")
    if not all(isinstance(value, dict) for value in (status_counts, level_counts, contractor_returned)):
        raise ValueError("Latest summary is missing status, level, or contractor metrics")

    active = number(level_counts.get("Active"), "level_counts.Active")
    returned = number(status_counts.get("returned"), "status_counts.returned")
    open_active = number(status_counts.get("missing"), "status_counts.missing")
    raw_submissions = number(manifest.get("survey_submission_count"), "survey_submission_count")
    contractors = {
        str(name): number(value, f"contractor_returned.{name}")
        for name, value in contractor_returned.items()
    }
    return {
        "generated_on": str(manifest.get("generated_on") or "Unknown"),
        "latest_month": str(summary.get("latest_month") or "Unknown"),
        "latest_assignment_period": str(summary.get("latest_assignment_period") or "Unknown"),
        "latest_survey_period": str(summary.get("latest_survey_period") or "Unknown"),
        "raw_submissions": raw_submissions,
        "active": active,
        "returned": returned,
        "open_active": open_active,
        "completion_pct": round((returned / active * 100) if active else 0, 1),
        "contractors": contractors,
    }


def signed(value: int, suffix: str = "") -> str:
    return f"{value:+d}{suffix}" if value else f"0{suffix}"


def signed_decimal(value: float, suffix: str = "") -> str:
    return f"{value:+.1f}{suffix}" if value else f"0.0{suffix}"


def brief_markdown(current: dict, previous: dict | None, brief_date: date) -> tuple[str, str]:
    title_date = brief_date.isoformat()
    header = f"[LandCare Morning Brief] {title_date}"
    freshness = (
        f"Published snapshot generated **{current['generated_on']}** · "
        f"assignment period **{current['latest_assignment_period']}** · "
        f"survey period **{current['latest_survey_period']}**."
    )

    if previous is None:
        title = f"{header} — baseline established"
        body = [
            "<!-- landcare-morning-brief -->",
            f"# {title}",
            "",
            "The first automated brief establishes the comparison baseline; daily movement will begin in the next issue.",
            "",
            "## Current executive position",
            f"- **Raw survey submissions:** {current['raw_submissions']:,}",
            f"- **Assignment-matched returns:** {current['returned']:,} of {current['active']:,} Active assignments ({current['completion_pct']:.1f}%)",
            f"- **Open Active queue:** {current['open_active']:,}",
            "",
            f"## Freshness\n{freshness}",
        ]
    else:
        raw_delta = current["raw_submissions"] - previous["raw_submissions"]
        returned_delta = current["returned"] - previous["returned"]
        active_delta = current["active"] - previous["active"]
        open_delta = current["open_active"] - previous["open_active"]
        completion_delta = round(current["completion_pct"] - previous["completion_pct"], 1)
        contractor_deltas = sorted(
            (
                (name, count - previous["contractors"].get(name, 0))
                for name, count in current["contractors"].items()
            ),
            key=lambda item: (-item[1], item[0]),
        )
        contributors = [(name, delta) for name, delta in contractor_deltas if delta > 0]
        movement = any((raw_delta, returned_delta, active_delta, open_delta, completion_delta))
        title = f"{header} — {'movement detected' if movement else 'no material movement'}"
        body = [
            "<!-- landcare-morning-brief -->",
            f"# {title}",
            "",
            "## Executive movement since the previous published data snapshot",
            f"- **New raw survey submissions:** {signed(raw_delta)} (current {current['raw_submissions']:,})",
            f"- **New assignment-matched returns:** {signed(returned_delta)} (current {current['returned']:,})",
            f"- **Active completion:** {current['completion_pct']:.1f}% ({signed_decimal(completion_delta, ' pp')}; {current['returned']:,} returned of {current['active']:,} Active)",
            f"- **Open Active queue:** {current['open_active']:,} ({signed(open_delta)})",
            f"- **Active assignment scope:** {current['active']:,} ({signed(active_delta)})",
            "",
            "## Contractor contribution",
        ]
        if contributors:
            body.extend(f"- **{name}:** +{delta} new assignment-matched return{'s' if delta != 1 else ''}" for name, delta in contributors[:5])
        else:
            body.append("- No contractor gained a new assignment-matched return in the published comparison.")
        body.extend(["", f"## Freshness\n{freshness}"])

    body.extend(
        [
            "",
            "## Act now",
            f"- [Open Map Monitor]({MAP_MONITOR_URL})",
            f"- [Open KPI Dashboard]({KPI_DASHBOARD_URL})",
            "",
            "*Contractor attribution is based on the assigned contractor for assignment-matched returns; it is not individual submitter attribution.*",
        ]
    )
    return title, "\n".join(body) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a LandCare executive morning brief in Markdown.")
    parser.add_argument("--current-dir", type=Path, required=True, help="Directory containing the current published data files.")
    parser.add_argument("--previous-dir", type=Path, help="Directory containing the prior published data files.")
    parser.add_argument("--output", type=Path, required=True, help="Destination Markdown file.")
    parser.add_argument("--date", help="Brief date as YYYY-MM-DD; defaults to America/New_York today.")
    parser.add_argument("--github-output", type=Path, help="Optional GitHub Actions output file.")
    args = parser.parse_args()

    brief_date = date.fromisoformat(args.date) if args.date else datetime.now(ZoneInfo("America/New_York")).date()
    current = metric_snapshot(args.current_dir)
    previous = metric_snapshot(args.previous_dir) if args.previous_dir else None
    title, markdown = brief_markdown(current, previous, brief_date)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(markdown, encoding="utf-8", newline="\n")
    if args.github_output:
        with args.github_output.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(f"brief_date={brief_date.isoformat()}\n")
            handle.write(f"title={title}\n")
    print(title)


if __name__ == "__main__":
    main()
