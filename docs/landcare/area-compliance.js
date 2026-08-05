function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildPowerBiAreaCompliance(financeSummary) {
  const source = financeSummary?.semantic_area_summary;
  const isPowerBi = source?.source_system === "Power BI semantic model";
  if (!isPowerBi || source?.status !== "available") {
    return {
      metadata: {
        source_status: "unavailable",
        feed_status: source?.feed_status || "unavailable",
        source_system: isPowerBi ? source.source_system : null,
        message: "Power BI parcel-area aggregates have not been published."
      },
      rows: []
    };
  }

  const rows = (source.rows || []).map((row) => {
    const assignedSqft = numberOrNull(row.assigned_sqft);
    const baselineSqft = numberOrNull(row.baseline_sqft);
    const lowerLimit = numberOrNull(row.lower_limit_sqft) ?? (baselineSqft === null ? null : baselineSqft * 0.9);
    const upperLimit = numberOrNull(row.upper_limit_sqft) ?? (baselineSqft === null ? null : baselineSqft * 1.1);
    const variancePct = assignedSqft === null || !baselineSqft
      ? null
      : ((assignedSqft - baselineSqft) / baselineSqft) * 100;
    let complianceStatus = "baseline_unavailable";
    if (assignedSqft !== null && lowerLimit !== null && upperLimit !== null) {
      complianceStatus = assignedSqft < lowerLimit
        ? "below_tolerance"
        : assignedSqft > upperLimit
          ? "above_tolerance"
          : "within_tolerance";
    }
    return {
      period_month: String(row.period_month || "").slice(0, 7),
      organization: String(row.organization || "Unassigned"),
      assigned_sqft: assignedSqft,
      assigned_parcels: numberOrNull(row.assigned_parcels),
      baseline_sqft: baselineSqft,
      lower_limit_sqft: lowerLimit,
      upper_limit_sqft: upperLimit,
      variance_pct: variancePct,
      compliance_status: complianceStatus
    };
  }).filter((row) => row.period_month && row.organization !== "Unassigned")
    .sort((a, b) => a.period_month.localeCompare(b.period_month) || Number(b.assigned_sqft || 0) - Number(a.assigned_sqft || 0));

  return {
    metadata: {
      source_status: rows.length ? "available" : "unavailable",
      feed_status: source.feed_status || "current",
      source_system: source.source_system,
      dataset_refreshed_at: source.dataset_refreshed_at || null,
      extracted_at: source.extracted_at || null,
      message: rows.length ? null : "Power BI returned no parcel-area aggregates."
    },
    rows
  };
}
