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


def brief_html(current: dict, previous: dict | None, brief_date: date) -> str:
    """Return a mobile-friendly email that follows the Executive BI color system."""
    if previous is None:
        headline = "Baseline established"
        subhead = "The first automated brief establishes the comparison baseline."
        raw_delta = returned_delta = open_delta = completion_delta = None
        contributors: list[tuple[str, int]] = []
    else:
        raw_delta = current["raw_submissions"] - previous["raw_submissions"]
        returned_delta = current["returned"] - previous["returned"]
        open_delta = current["open_active"] - previous["open_active"]
        completion_delta = round(current["completion_pct"] - previous["completion_pct"], 1)
        movement = any((raw_delta, returned_delta, open_delta, completion_delta))
        headline = "Movement detected" if movement else "No material movement"
        subhead = "Compared with the previous published LandCare data snapshot."
        contributors = sorted(
            ((name, count - previous["contractors"].get(name, 0)) for name, count in current["contractors"].items()),
            key=lambda item: (-item[1], item[0]),
        )
        contributors = [(name, delta) for name, delta in contributors if delta > 0][:5]

    def delta(value: int | float | None, suffix: str = "") -> str:
        if value is None:
            return "Baseline"
        if isinstance(value, float):
            return f"{value:+.1f}{suffix}" if value else f"0.0{suffix}"
        return f"{value:+d}{suffix}" if value else f"0{suffix}"

    contributor_rows = "".join(
        f"<tr><td>{name}</td><td align=\"right\"><strong>+{value}</strong></td></tr>" for name, value in contributors
    ) or "<tr><td colspan=\"2\">No new assignment-matched returns by contractor.</td></tr>"
    return f"""<!doctype html>
<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
<style>
body{{margin:0;background:#eef3f6;color:#102a43;font-family:Arial,Helvetica,sans-serif}} .wrap{{width:100%;padding:24px 12px;box-sizing:border-box}} .card{{max-width:640px;margin:auto;background:#fff;border:1px solid #dbe5ea;border-radius:12px;overflow:hidden}} .mast{{background:#00334f;color:#fff;padding:26px 28px}} .mast p{{margin:6px 0 0;color:#ccecf9;font-size:14px}} .content{{padding:24px 28px}} h1{{font-size:24px;margin:0}} h2{{font-size:16px;color:#00334f;margin:26px 0 10px}} .status{{color:#006c9f;font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:.04em}} .metrics{{width:100%;border-collapse:separate;border-spacing:8px 8px;margin:10px -8px}} .metric{{background:#e8f6fc;border-radius:8px;padding:14px;vertical-align:top}} .label{{display:block;color:#486581;font-size:12px;margin-bottom:6px}} .value{{display:block;color:#00334f;font-size:24px;font-weight:700}} .delta{{display:block;color:#006c9f;font-size:13px;margin-top:5px}} table.contributors{{width:100%;border-collapse:collapse;font-size:14px}} table.contributors td{{padding:10px 0;border-bottom:1px solid #e5edf1}} .button{{display:inline-block;background:#006c9f;color:#fff!important;text-decoration:none;padding:11px 16px;border-radius:6px;font-weight:700;margin:4px 8px 4px 0}} .footer{{padding:16px 28px;background:#f6f9fa;color:#627d98;font-size:12px;line-height:1.45}} @media only screen and (max-width:600px){{.wrap{{padding:0}} .card{{border-radius:0;border:0}} .mast,.content,.footer{{padding-left:20px;padding-right:20px}} .metrics,.metrics tbody,.metrics tr,.metric{{display:block;width:100%;box-sizing:border-box}} .metrics{{margin:4px 0}} .metric{{margin:8px 0}} .button{{display:block;text-align:center;margin:8px 0}}}}
</style></head><body><div class=\"wrap\"><main class=\"card\"><section class=\"mast\"><h1>LandCare Morning Brief</h1><p>{brief_date.isoformat()} · Executive operating update</p></section><section class=\"content\"><div class=\"status\">{headline}</div><p>{subhead}</p><table role=\"presentation\" class=\"metrics\"><tr><td class=\"metric\"><span class=\"label\">Raw survey submissions</span><span class=\"value\">{current['raw_submissions']:,}</span><span class=\"delta\">{delta(raw_delta)}</span></td><td class=\"metric\"><span class=\"label\">Matched returns</span><span class=\"value\">{current['returned']:,}</span><span class=\"delta\">{delta(returned_delta)}</span></td></tr><tr><td class=\"metric\"><span class=\"label\">Active completion</span><span class=\"value\">{current['completion_pct']:.1f}%</span><span class=\"delta\">{delta(completion_delta, ' pp')}</span></td><td class=\"metric\"><span class=\"label\">Open Active queue</span><span class=\"value\">{current['open_active']:,}</span><span class=\"delta\">{delta(open_delta)}</span></td></tr></table><h2>Contractor contribution</h2><table class=\"contributors\"><tbody>{contributor_rows}</tbody></table><h2>Act now</h2><a class=\"button\" href=\"{MAP_MONITOR_URL}\">Open Map Monitor</a><a class=\"button\" href=\"{KPI_DASHBOARD_URL}\">Open KPI Dashboard</a></section><footer class=\"footer\">Published snapshot generated {current['generated_on']} · Assignment period {current['latest_assignment_period']} · Survey period {current['latest_survey_period']}. Contractor attribution reflects the assigned contractor for assignment-matched returns.</footer></main></div></body></html>"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a LandCare executive morning brief in Markdown.")
    parser.add_argument("--current-dir", type=Path, required=True, help="Directory containing the current published data files.")
    parser.add_argument("--previous-dir", type=Path, help="Directory containing the prior published data files.")
    parser.add_argument("--output", type=Path, required=True, help="Destination Markdown file.")
    parser.add_argument("--html-output", type=Path, help="Optional destination for the themed HTML email.")
    parser.add_argument("--date", help="Brief date as YYYY-MM-DD; defaults to America/New_York today.")
    parser.add_argument("--github-output", type=Path, help="Optional GitHub Actions output file.")
    args = parser.parse_args()

    brief_date = date.fromisoformat(args.date) if args.date else datetime.now(ZoneInfo("America/New_York")).date()
    current = metric_snapshot(args.current_dir)
    previous = metric_snapshot(args.previous_dir) if args.previous_dir else None
    title, markdown = brief_markdown(current, previous, brief_date)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(markdown, encoding="utf-8", newline="\n")
    if args.html_output:
        args.html_output.parent.mkdir(parents=True, exist_ok=True)
        args.html_output.write_text(brief_html(current, previous, brief_date), encoding="utf-8", newline="\n")
    if args.github_output:
        with args.github_output.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(f"brief_date={brief_date.isoformat()}\n")
            handle.write(f"title={title}\n")
    print(title)


if __name__ == "__main__":
    main()
