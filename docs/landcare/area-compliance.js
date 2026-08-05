function contractorKey(value) {
  return String(value || "")
    .replace(/\s+Primary Contact$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parcelKey(properties, index) {
  return String(
    properties.parcel_digits ||
    properties.parcel_key ||
    properties.parcel_number ||
    properties.alco_pin ||
    properties.assignment_id ||
    index
  );
}

export function buildLiveAreaCompliance(assignmentGeojson, financeSummary) {
  const baselines = new Map(
    (financeSummary?.contract_area_baselines || []).map((row) => [contractorKey(row.organization), row])
  );
  const groups = new Map();

  for (const [index, feature] of (assignmentGeojson?.features || []).entries()) {
    const properties = feature?.properties || {};
    const periodMonth = String(properties.period_month || properties.period_label || "").slice(0, 7);
    const organization = String(properties.organization || "Unassigned").replace(/\s+Primary Contact$/i, "");
    if (!periodMonth || !organization || organization === "Unassigned") continue;

    const key = `${periodMonth}|${contractorKey(organization)}`;
    if (!groups.has(key)) {
      groups.set(key, { period_month: periodMonth, organization, parcels: new Map() });
    }
    const sqft = Number(properties.parcel_sqft || 0);
    const group = groups.get(key);
    const parcel = parcelKey(properties, index);
    group.parcels.set(parcel, Math.max(Number(group.parcels.get(parcel) || 0), Number.isFinite(sqft) ? sqft : 0));
  }

  const rows = [...groups.values()].map((group) => {
    const assignedSqft = [...group.parcels.values()].reduce((sum, value) => sum + value, 0);
    const baselineRecord = baselines.get(contractorKey(group.organization));
    const baselineSqft = baselineRecord ? Number(baselineRecord.baseline_sqft) : null;
    const hasBaseline = Number.isFinite(baselineSqft) && baselineSqft > 0;
    const lowerLimit = hasBaseline ? baselineSqft * 0.9 : null;
    const upperLimit = hasBaseline ? baselineSqft * 1.1 : null;
    const variancePct = hasBaseline ? ((assignedSqft - baselineSqft) / baselineSqft) * 100 : null;
    let complianceStatus = "baseline_unavailable";
    if (hasBaseline) {
      complianceStatus = assignedSqft < lowerLimit
        ? "below_tolerance"
        : assignedSqft > upperLimit
          ? "above_tolerance"
          : "within_tolerance";
    }
    return {
      period_month: group.period_month,
      organization: group.organization,
      assigned_sqft: assignedSqft,
      assigned_parcels: group.parcels.size,
      baseline_sqft: hasBaseline ? baselineSqft : null,
      lower_limit_sqft: lowerLimit,
      upper_limit_sqft: upperLimit,
      variance_pct: variancePct,
      compliance_status: complianceStatus
    };
  }).sort((a, b) => a.period_month.localeCompare(b.period_month) || b.assigned_sqft - a.assigned_sqft);

  return {
    metadata: {
      source_status: rows.length ? "available" : "unavailable",
      assigned_area_source: "Live ArcGIS assignment history sq_footage",
      baseline_source: "Power BI Parcel Area Distribution validated contract baseline",
      baseline_refreshed_at: financeSummary?.contract_area_baseline_source?.refreshed_at || null
    },
    rows
  };
}
