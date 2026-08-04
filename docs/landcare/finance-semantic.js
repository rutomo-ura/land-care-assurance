export function semanticYearSummary(financeSummary, selectedYear) {
  const year = Number(selectedYear);
  return (financeSummary?.semantic_summary?.annual || []).find((row) => Number(row.year) === year) || null;
}

export function semanticQuarterSummary(financeSummary, selectedQuarter) {
  const year = Number(String(selectedQuarter || "").slice(0, 4));
  const annual = semanticYearSummary(financeSummary, year);
  return (annual?.quarters || []).find((row) => row.quarter === selectedQuarter) || null;
}

export function financeFeedState(financeSummary) {
  const source = financeSummary?.actual_invoice_source || {};
  return {
    available: source.status === "available",
    stale: source.feed_status === "stale",
    sourceLabel: source.source_system === "Power BI semantic model" ? "Power BI Land Care Budget model" : source.source_system || "Finance source",
    refreshedAt: source.refreshed_at || null
  };
}
