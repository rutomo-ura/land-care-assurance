from __future__ import annotations

import math
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = ROOT / "outputs" / "week-1-day-1"
OUTPUT_DIR = INPUT_DIR / "contractor-analysis"
LOCAL_PACKAGES = INPUT_DIR / ".python-packages"

if LOCAL_PACKAGES.exists():
    sys.path.insert(0, str(LOCAL_PACKAGES))

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
MPL_CONFIG_DIR = OUTPUT_DIR / ".mplconfig"
MPL_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("MPLCONFIGDIR", str(MPL_CONFIG_DIR))

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns


DATE_STAMP = "2026-06-09"
BLUE = "#2563eb"
GOLD = "#b7791f"
ORANGE = "#c2410c"
OLIVE = "#5f6f1f"
INK = "#1f2937"
MUTED = "#6b7280"
GRID = "#e5e7eb"


def clean_org(value: str) -> str:
    return value.replace(" Primary Contact", "").replace(" & LawnCare", "")


def wilson_lower_bound(successes: float, total: float, z: float = 1.96) -> float:
    if total <= 0:
        return 0.0
    p = successes / total
    denom = 1 + z**2 / total
    centre = p + z**2 / (2 * total)
    margin = z * math.sqrt((p * (1 - p) + z**2 / (4 * total)) / total)
    return max(0.0, (centre - margin) / denom)


def style_axes(ax, title: str, subtitle: str | None = None) -> None:
    ax.set_title(title, loc="left", fontsize=14, fontweight="bold", color=INK, pad=18)
    if subtitle:
        ax.text(
            0,
            1.015,
            subtitle,
            transform=ax.transAxes,
            ha="left",
            va="bottom",
            fontsize=9.5,
            color=MUTED,
        )
    ax.grid(axis="x", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for side in ["top", "right"]:
        ax.spines[side].set_visible(False)
    ax.spines["left"].set_color(GRID)
    ax.spines["bottom"].set_color(GRID)
    ax.tick_params(colors=INK)


def save_current_figure(name: str) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / name
    plt.savefig(path, dpi=180, bbox_inches="tight", facecolor="white")
    plt.close()
    return path


def load_data() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    completion = pd.read_csv(INPUT_DIR / "completion_by_organization.csv")
    levels = pd.read_csv(INPUT_DIR / "completion_by_level.csv")
    periods = pd.read_csv(INPUT_DIR / "survey_periods.csv", parse_dates=["period_date"])
    return completion, levels, periods


def build_contractor_table(completion: pd.DataFrame, levels: pd.DataFrame) -> pd.DataFrame:
    active = completion[completion["maintenance_level"].eq("Active")].copy()
    active["contractor"] = active["organization"].map(clean_org)
    active = active[active["contractor"].ne("Unassigned")].copy()

    active_level = levels[levels["maintenance_level"].eq("Active")].iloc[0]
    active_total = active_level["assigned_parcel_keys"]
    returned_total = active_level["returned_assigned_parcel_keys"]
    overall_rate = returned_total / active_total

    active["completion_rate"] = (
        active["returned_assigned_parcel_keys"] / active["assigned_parcel_keys"]
    )
    active["completion_rate_pct"] = (100 * active["completion_rate"]).round(1)
    active["overall_active_rate_pct"] = round(100 * overall_rate, 1)
    active["expected_returns_at_overall_rate"] = (
        active["assigned_parcel_keys"] * overall_rate
    )
    active["return_gap_vs_expected"] = (
        active["returned_assigned_parcel_keys"]
        - active["expected_returns_at_overall_rate"]
    )
    active["return_gap_vs_expected"] = active["return_gap_vs_expected"].round(1)
    active["rate_gap_vs_overall_pp"] = (
        active["completion_rate_pct"] - active["overall_active_rate_pct"]
    ).round(1)
    active["assigned_share_pct"] = (
        100 * active["assigned_parcel_keys"] / active_total
    ).round(1)
    active["returned_share_pct"] = (
        100 * active["returned_assigned_parcel_keys"] / returned_total
    ).round(1)
    active["wilson_lower_bound_pct"] = active.apply(
        lambda row: round(
            100
            * wilson_lower_bound(
                row["returned_assigned_parcel_keys"], row["assigned_parcel_keys"]
            ),
            1,
        ),
        axis=1,
    )

    def segment(row: pd.Series) -> str:
        if row["assigned_parcel_keys"] >= 50 and row["completion_rate_pct"] <= 5:
            return "large_gap"
        if row["completion_rate_pct"] >= 50 and row["assigned_parcel_keys"] >= 20:
            return "high_rate"
        if row["completion_rate_pct"] >= 50:
            return "small_high_rate"
        if row["returned_assigned_parcel_keys"] == 0:
            return "zero_return"
        return "middle"

    active["performance_segment"] = active.apply(segment, axis=1)
    active["rank_by_rate"] = active["completion_rate_pct"].rank(
        method="dense", ascending=False
    ).astype(int)
    active["rank_by_gap"] = active["return_gap_vs_expected"].rank(
        method="dense", ascending=False
    ).astype(int)

    cols = [
        "contractor",
        "assigned_parcel_keys",
        "returned_assigned_parcel_keys",
        "completion_rate_pct",
        "overall_active_rate_pct",
        "rate_gap_vs_overall_pp",
        "expected_returns_at_overall_rate",
        "return_gap_vs_expected",
        "assigned_share_pct",
        "returned_share_pct",
        "wilson_lower_bound_pct",
        "performance_segment",
        "rank_by_rate",
        "rank_by_gap",
    ]
    return active[cols].sort_values(
        ["completion_rate_pct", "assigned_parcel_keys"], ascending=[False, False]
    )


def build_timeline_table(periods: pd.DataFrame) -> pd.DataFrame:
    timeline = periods.sort_values("period_date").copy()
    timeline["period"] = timeline["period_date"].dt.strftime("%Y-%m")
    timeline["pct_change_vs_prior_period"] = (
        100 * timeline["survey_rows"].pct_change()
    ).round(1)
    timeline["rolling_3_period_avg"] = (
        timeline["survey_rows"].rolling(3, min_periods=1).mean().round(1)
    )
    timeline["rolling_6_period_avg"] = (
        timeline["survey_rows"].rolling(6, min_periods=3).mean().round(1)
    )
    timeline["commitment_index_vs_6_period_avg"] = (
        100 * timeline["survey_rows"] / timeline["rolling_6_period_avg"]
    ).round(1)
    timeline.loc[
        timeline["rolling_6_period_avg"].isna(), "commitment_index_vs_6_period_avg"
    ] = pd.NA
    return timeline


def plot_completion_rate(contractors: pd.DataFrame) -> Path:
    plot_df = contractors.sort_values("completion_rate_pct", ascending=True)
    palette = {
        "high_rate": BLUE,
        "small_high_rate": BLUE,
        "large_gap": ORANGE,
        "zero_return": "#9ca3af",
        "middle": GOLD,
    }
    colors = [palette[v] for v in plot_df["performance_segment"]]
    fig, ax = plt.subplots(figsize=(11, 6.5))
    ax.barh(plot_df["contractor"], plot_df["completion_rate_pct"], color=colors)
    overall = contractors["overall_active_rate_pct"].iloc[0]
    ax.axvline(overall, color=INK, linewidth=1.4, linestyle="--")
    ax.text(overall + 1, len(plot_df) - 0.35, f"overall {overall:.1f}%", color=INK)
    for idx, value in enumerate(plot_df["completion_rate_pct"]):
        ax.text(value + 1, idx, f"{value:.1f}%", va="center", fontsize=9, color=INK)
    ax.set_xlabel("Completion rate (%)")
    ax.set_ylabel("")
    ax.set_xlim(0, max(100, plot_df["completion_rate_pct"].max() + 10))
    style_axes(
        ax,
        "Active completion rate by contractor",
        "Current quarter, normalized assignment keys. Reference line shows 14.0% overall Active completion.",
    )
    return save_current_figure("contractor_completion_rate.png")


def plot_return_gap(contractors: pd.DataFrame) -> Path:
    plot_df = contractors.sort_values("return_gap_vs_expected", ascending=True)
    colors = [BLUE if value >= 0 else ORANGE for value in plot_df["return_gap_vs_expected"]]
    fig, ax = plt.subplots(figsize=(11, 6.5))
    ax.barh(plot_df["contractor"], plot_df["return_gap_vs_expected"], color=colors)
    ax.axvline(0, color=INK, linewidth=1)
    for idx, value in enumerate(plot_df["return_gap_vs_expected"]):
        label = f"{value:+.1f}"
        offset = 1 if value >= 0 else -1
        ha = "left" if value >= 0 else "right"
        ax.text(value + offset, idx, label, va="center", ha=ha, fontsize=9, color=INK)
    ax.set_xlabel("Returned assignments above or below expected")
    ax.set_ylabel("")
    style_axes(
        ax,
        "Returned surveys versus expected at the overall rate",
        "Expected returns use each contractor's Active assignment count multiplied by the 14.0% overall Active rate.",
    )
    return save_current_figure("contractor_return_gap_vs_expected.png")


def plot_volume_rate_scatter(contractors: pd.DataFrame) -> Path:
    fig, ax = plt.subplots(figsize=(10, 6.5))
    sizes = contractors["returned_assigned_parcel_keys"].clip(lower=1) * 24
    segment_colors = {
        "high_rate": BLUE,
        "small_high_rate": BLUE,
        "large_gap": ORANGE,
        "zero_return": "#9ca3af",
        "middle": GOLD,
    }
    colors = contractors["performance_segment"].map(segment_colors)
    ax.scatter(
        contractors["assigned_parcel_keys"],
        contractors["completion_rate_pct"],
        s=sizes,
        c=colors,
        alpha=0.75,
        edgecolor=INK,
        linewidth=0.6,
    )
    overall = contractors["overall_active_rate_pct"].iloc[0]
    ax.axhline(overall, color=INK, linewidth=1.2, linestyle="--")
    ax.text(360, overall + 1.5, f"overall {overall:.1f}%", color=INK, ha="right")
    for _, row in contractors.iterrows():
        label = row["contractor"].split()[0]
        ax.text(
            row["assigned_parcel_keys"] + 4,
            row["completion_rate_pct"] + 1.0,
            label,
            fontsize=8.5,
            color=INK,
        )
    ax.set_xlabel("Active assigned parcel keys")
    ax.set_ylabel("Completion rate (%)")
    ax.set_ylim(-4, 100)
    style_axes(
        ax,
        "Contractor volume versus completion rate",
        "Bubble size is returned assignment keys. Large low-rate contractors should be reviewed first.",
    )
    return save_current_figure("contractor_volume_rate_outliers.png")


def plot_timeline(timeline: pd.DataFrame) -> Path:
    fig, ax = plt.subplots(figsize=(12, 6.5))
    ax.plot(
        timeline["period_date"],
        timeline["survey_rows"],
        marker="o",
        linewidth=2.0,
        color=BLUE,
        label="Survey rows",
    )
    ax.plot(
        timeline["period_date"],
        timeline["rolling_3_period_avg"],
        linewidth=2.2,
        color=GOLD,
        label="3-period average",
    )
    latest = timeline.iloc[-1]
    ax.scatter(
        [latest["period_date"]],
        [latest["survey_rows"]],
        s=100,
        color=ORANGE,
        edgecolor=INK,
        zorder=5,
    )
    ax.set_xlabel("Period")
    ax.set_ylabel("Survey rows")
    ax.legend(loc="upper left", frameon=False)
    style_axes(
        ax,
        "Returned survey volume is volatile across periods",
        "Overall timeline only. Contractor-level consistency needs the period-by-contractor query in the SQL checklist.",
    )
    fig.autofmt_xdate(rotation=35)
    return save_current_figure("overall_survey_volume_timeline.png")


def write_sql_checklist(path: Path) -> None:
    sql = """-- Week 1 contractor overtime query
-- Read-only. Run in pgAdmin against URA GISDB, then export the result to CSV.
-- Suggested output: outputs/week-1-day-1/contractor_period_completion.csv

with assignment_universe as (
    select distinct
        regexp_replace(parcel_number::text, '[^0-9]', '', 'g') as assignment_digits,
        coalesce(property_maint_mgr_name, 'Unassigned') as organization,
        case
            when tags ilike '%LandCare - Active%' then 'Active'
            when tags ilike '%LandCare - Request Only%' then 'Request Only'
            else 'Other'
        end as maintenance_level
    from gis.epp_snapshot
    where tags ilike '%LandCare - Active%'
       or tags ilike '%LandCare - Request Only%'
),
active_assignments as (
    select
        organization,
        maintenance_level,
        count(distinct assignment_digits) as assigned_parcel_keys
    from assignment_universe
    where maintenance_level = 'Active'
    group by organization, maintenance_level
),
periods as (
    select distinct
        date_trunc('month', period)::date as period_month
    from gis.regrid_survey_submissions
    where period >= date '2023-11-01'
),
returned_by_period as (
    select
        date_trunc('month', s.period)::date as period_month,
        a.organization,
        a.maintenance_level,
        count(distinct a.assignment_digits) as returned_assigned_parcel_keys
    from gis.regrid_survey_submissions s
    join assignment_universe a
        on regexp_replace(s.parcelnumb::text, '[^0-9]', '', 'g') = a.assignment_digits
    where s.period >= date '2023-11-01'
      and a.maintenance_level = 'Active'
    group by period_month, a.organization, a.maintenance_level
)
select
    p.period_month,
    a.organization,
    a.maintenance_level,
    a.assigned_parcel_keys,
    coalesce(r.returned_assigned_parcel_keys, 0) as returned_assigned_parcel_keys,
    round(
        100.0 * coalesce(r.returned_assigned_parcel_keys, 0)
        / nullif(a.assigned_parcel_keys, 0),
        1
    ) as completion_rate_pct
from periods p
cross join active_assignments a
left join returned_by_period r
    on r.period_month = p.period_month
   and r.organization = a.organization
   and r.maintenance_level = a.maintenance_level
order by p.period_month desc, a.organization;
"""
    path.write_text(sql, encoding="utf-8", newline="\n")


def write_markdown(
    contractors: pd.DataFrame,
    timeline: pd.DataFrame,
    chart_paths: list[Path],
    path: Path,
) -> None:
    top_rate = contractors.iloc[0]
    scalable = contractors[contractors["assigned_parcel_keys"].ge(50)].sort_values(
        "return_gap_vs_expected", ascending=False
    ).iloc[0]
    largest_gap = contractors.sort_values("return_gap_vs_expected").iloc[0]
    latest = timeline.iloc[-1]
    recent = timeline.tail(6)
    avg6 = recent["survey_rows"].mean()
    cv_all = timeline["survey_rows"].std(ddof=0) / timeline["survey_rows"].mean()
    cv_recent = recent["survey_rows"].std(ddof=0) / recent["survey_rows"].mean()

    chart_list = "\n".join(f"- `{p.name}`" for p in chart_paths)
    md = f"""# Contractor Completion Analysis

Date: {DATE_STAMP}
Source: `outputs/week-1-day-1/*.csv`

## Main Findings

- Overall Active completion is 14.0%, based on 142 returned assignment keys out of 1,011 Active assignment keys.
- {top_rate['contractor']} has the highest current-quarter rate at {top_rate['completion_rate_pct']:.1f}%, with {int(top_rate['returned_assigned_parcel_keys'])} returns from {int(top_rate['assigned_parcel_keys'])} Active assigned keys.
- {scalable['contractor']} is the strongest scalable performer: {scalable['completion_rate_pct']:.1f}% completion on {int(scalable['assigned_parcel_keys'])} Active assigned keys, {scalable['return_gap_vs_expected']:+.1f} returns above expected at the overall rate.
- {largest_gap['contractor']} is the largest operational gap: {largest_gap['completion_rate_pct']:.1f}% completion on {int(largest_gap['assigned_parcel_keys'])} Active assigned keys, {largest_gap['return_gap_vs_expected']:+.1f} returns versus expected.
- Overall survey volume is volatile. The full-period coefficient of variation is {cv_all:.2f}; the latest six periods are also uneven at {cv_recent:.2f}.

## Business Meaning

The spread is large enough that contractor behavior, assignment quality, and reporting process should be reviewed separately. A single dashboard completion rate hides two management questions: who is reliably completing work, and where a low rate matters most because the assignment volume is large.

For current-quarter follow-up, start with large low-rate contractors before small zero-return groups. KRJ and Chatman carry the biggest volume risk. Ervin is the best benchmark for scalable performance because it combines high completion with meaningful assignment volume.

## Timeline Read

The exported timeline supports only total survey volume by period, not contractor-level consistency. Latest period volume is {int(latest['survey_rows'])} rows. The latest six-period average is {avg6:.1f} rows. That makes the latest period materially below the recent operating run rate.

Contractor-level consistency, commitment rate, and overtime outlier calls require a period-by-contractor export. Use `contractor_period_completion_readonly.sql`, then export the result as `contractor_period_completion.csv`.

## Notes

The overall rate uses `completion_by_level.csv`, which is the reconciled distinct Active universe. Contractor rows come from `completion_by_organization.csv`; organization group totals may not sum to the same denominator when a normalized parcel key appears in more than one group.

## Generated Charts

{chart_list}

## Generated Tables

- `contractor_performance_analysis.csv`
- `timeline_consistency_overall.csv`
- `contractor_period_completion_readonly.sql`
"""
    path.write_text(md, encoding="utf-8", newline="\n")


def main() -> None:
    completion, levels, periods = load_data()
    contractors = build_contractor_table(completion, levels)
    timeline = build_timeline_table(periods)

    contractors.to_csv(OUTPUT_DIR / "contractor_performance_analysis.csv", index=False)
    timeline.to_csv(OUTPUT_DIR / "timeline_consistency_overall.csv", index=False)

    sns.set_theme(style="whitegrid", font="DejaVu Sans")
    chart_paths = [
        plot_completion_rate(contractors),
        plot_return_gap(contractors),
        plot_volume_rate_scatter(contractors),
        plot_timeline(timeline),
    ]
    write_sql_checklist(OUTPUT_DIR / "contractor_period_completion_readonly.sql")
    write_markdown(
        contractors,
        timeline,
        chart_paths,
        OUTPUT_DIR / f"contractor-completion-analysis-{DATE_STAMP}.md",
    )
    print(f"Wrote analysis to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
