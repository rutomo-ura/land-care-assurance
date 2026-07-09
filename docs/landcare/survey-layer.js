export const SURVEY_LAYER_URL =
  "https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/gisdb_gis_regrid_surveys/FeatureServer/0";
export const SURVEY_AGOL_ITEM_ID = "a4012693d5d74dd8998610c4d235068d";
export const SURVEY_AGOL_ITEM_URL =
  "https://urap.maps.arcgis.com/home/item.html?id=a4012693d5d74dd8998610c4d235068d";
export const SURVEY_LAYER_NAME = "gisdb_gis_regrid_surveys";

export function parcelDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function dateFromMillis(value) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

export async function fetchArcgisJson(url, params) {
  const response = await fetch(`${url}?${new URLSearchParams(params).toString()}`);
  if (!response.ok) throw new Error(`ArcGIS request failed: ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "ArcGIS request failed");
  return payload;
}

export async function fetchSurveyLayerMetadata() {
  const payload = await fetchArcgisJson(SURVEY_LAYER_URL, { f: "json" });
  return {
    title: payload.name || SURVEY_LAYER_NAME,
    recordCount: payload.recordCount,
    dataLastEdit: dateFromMillis(payload.editingInfo?.dataLastEditDate),
    serviceItemId: payload.serviceItemId || SURVEY_AGOL_ITEM_ID,
    serviceUrl: SURVEY_LAYER_URL.replace(/\/0$/, "")
  };
}

export async function fetchSurveyPeriodStats() {
  const payload = await fetchArcgisJson(`${SURVEY_LAYER_URL}/query`, {
    f: "json",
    where: "1=1",
    groupByFieldsForStatistics: "period_label",
    outStatistics: JSON.stringify([
      { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "record_count" }
    ]),
    orderByFields: "period_label ASC"
  });
  return (payload.features || [])
    .map((feature) => feature.attributes || {})
    .filter((row) => row.period_label)
    .map((row) => ({
      period_label: String(row.period_label),
      record_count: Number(row.record_count || 0)
    }));
}

export async function fetchSurveyRecordsForPeriod(periodLabel) {
  const records = [];
  let offset = 0;
  const pageSize = 2000;
  const safePeriod = String(periodLabel || "").replace(/'/g, "''");
  while (true) {
    const payload = await fetchArcgisJson(`${SURVEY_LAYER_URL}/query`, {
      f: "json",
      where: `period_label = '${safePeriod}'`,
      outFields: "parcelnumb,period_label,maintained_by,created_at,status,address",
      returnGeometry: "false",
      resultRecordCount: String(pageSize),
      resultOffset: String(offset),
      orderByFields: "parcelnumb ASC, created_at ASC"
    });
    const batch = (payload.features || []).map((feature) => feature.attributes || {});
    records.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return records;
}

export function surveyParcelKeys(records) {
  return new Set(
    records
      .map((record) => parcelDigits(record.parcelnumb))
      .filter(Boolean)
  );
}

export async function loadSurveyEvidenceByPeriod(periodLabels) {
  const uniquePeriods = [...new Set((periodLabels || []).filter(Boolean))];
  const entries = await Promise.all(
    uniquePeriods.map(async (periodLabel) => {
      const records = await fetchSurveyRecordsForPeriod(periodLabel);
      return [periodLabel, surveyParcelKeys(records)];
    })
  );
  return Object.fromEntries(entries);
}

export function mergeAvailableMonths(staticMonths, periodStats) {
  const merged = new Set(staticMonths || []);
  for (const row of periodStats || []) {
    if (row.period_label) merged.add(row.period_label);
  }
  return [...merged].sort();
}

export function mergeSurveyEvidenceIntoGeojson(geojson, evidenceByPeriod) {
  const features = (geojson?.features || []).map((feature) => {
    const props = feature.properties || {};
    const periodMonth = String(props.period_month || "");
    const parcelKey = parcelDigits(props.parcel_key);
    const liveReturned = Boolean(parcelKey && evidenceByPeriod[periodMonth]?.has(parcelKey));
    const maintenanceLevel = props.maintenance_level;
    let completionStatus = props.completion_status;
    if (maintenanceLevel === "Request Only") {
      completionStatus = "request_only";
    } else if (liveReturned && maintenanceLevel === "Active") {
      completionStatus = "returned";
    } else if (maintenanceLevel === "Active") {
      completionStatus = "missing";
    }
    return {
      ...feature,
      properties: {
        ...props,
        returned_flag: liveReturned,
        completion_status: completionStatus,
        survey_source: liveReturned ? SURVEY_LAYER_NAME : props.survey_source || "assignment_export"
      }
    };
  });
  return {
    ...geojson,
    metadata: {
      ...(geojson?.metadata || {}),
      survey_layer_url: SURVEY_LAYER_URL,
      survey_layer_item_url: SURVEY_AGOL_ITEM_URL,
      survey_evidence_source: `ArcGIS Online ${SURVEY_LAYER_NAME}`
    },
    features
  };
}

export function enrichSummaryWithSurveyLayer(summary, surveyMetadata, periodStats) {
  const latestSurveyPeriod =
    periodStats?.at(-1)?.period_label || summary?.latest_survey_period || summary?.latest_month;
  const surveyPeriods = (periodStats || [])
    .map((row) => row.period_label)
    .filter(Boolean);
  return {
    ...summary,
    latest_survey_period: latestSurveyPeriod,
    latest_month: summary?.latest_month,
    available_months: summary?.available_months || [],
    survey_layer_summary: {
      data_last_edit: surveyMetadata?.dataLastEdit,
      record_count: surveyMetadata?.recordCount,
      service_url: surveyMetadata?.serviceUrl,
      item_url: SURVEY_AGOL_ITEM_URL,
      available_periods: surveyPeriods
    }
  };
}

export function enrichLatestMonthlyMetrics(monthlyMetrics, latestMonth, returnedAssignedCount) {
  if (!latestMonth || returnedAssignedCount == null) return monthlyMetrics;
  return monthlyMetrics.map((row) => {
    if (row.period_month !== latestMonth) return row;
    const assignedActive = Number(row.assigned_active || 0);
    const assignedTotal = Number(row.assigned_total || 0);
    const returned = Number(returnedAssignedCount);
    return {
      ...row,
      returned_assigned: returned,
      active_completion_rate_pct: assignedActive ? Math.round((1000 * returned) / assignedActive) / 10 : 0,
      blended_completion_rate_pct: assignedTotal ? Math.round((1000 * returned) / assignedTotal) / 10 : 0,
      survey_rows_raw: returned,
      survey_source: SURVEY_LAYER_NAME
    };
  });
}

export function countReturnedAssigned(features, periodMonth) {
  const activeReturned = new Set();
  for (const feature of features || []) {
    const props = feature.properties || {};
    if (props.period_month !== periodMonth) continue;
    if (props.maintenance_level !== "Active") continue;
    if (!props.returned_flag) continue;
    const key = parcelDigits(props.parcel_key);
    if (key) activeReturned.add(key);
  }
  return activeReturned.size;
}
