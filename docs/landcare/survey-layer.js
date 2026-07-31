import { SURVEY123_EVIDENCE_LAYER_URL } from "./survey-submission-config.js";

export const SURVEY_LAYER_URL =
  "https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/regrid_surveys/FeatureServer/0";
export const SURVEY_AGOL_ITEM_ID = "7a2e1d9bacba461296c54a63f104cf51";
export const SURVEY_AGOL_ITEM_URL =
  "https://urap.maps.arcgis.com/home/item.html?id=7a2e1d9bacba461296c54a63f104cf51";
export const SURVEY_LAYER_NAME = "gisdb_gis_regrid_surveys";

export function parcelDigits(value) {
  // Allegheny County parcel PINs can include a block letter (for example
  // 0124N00195000000). Keep that significant character while removing
  // formatting punctuation so evidence queries use the exact Regrid key.
  return String(value || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function linkedPhotoUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const candidates = [
    raw.match(/href\s*=\s*["']([^"']+)["']/i)?.[1],
    raw.match(/=HYPERLINK\(\s*["']([^"']+)["']/i)?.[1],
    raw.match(/\]\((https?:\/\/[^)\s]+)\)/i)?.[1],
    raw.match(/(https?:\/\/[^\s"'<>]+)/i)?.[1]
  ];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate || "");
      if (url.protocol === "https:" || url.protocol === "http:") return url.href;
    } catch {
      // Continue to the next representation of the hyperlink target.
    }
  }
  return "";
}

function normalizeRegridEvidence(attributes) {
  return {
    ...attributes,
    // `original_url` is the source-table hyperlink field. Regrid exports can
    // represent it as a raw URL, HTML anchor, or Excel HYPERLINK formula.
    // Prefer it when present, then retain the legacy published image_url.
    image_url: linkedPhotoUrl(attributes.original_url) || linkedPhotoUrl(attributes.image_url),
    // The Regrid export has used more than one field spelling across
    // deliveries. Normalize those source names once at the adapter boundary.
    service_date: attributes.service_date || attributes.date_of_services || attributes.date_services || null,
    // The replacement published layer calls this field `additional_comments`.
    // Retain prior aliases so archived or temporarily rolled-back layers still
    // produce the canonical app-level property.
    additional_notes: attributes.additional_comments || attributes.additional_notes || attributes.additional_note || attributes.notes || null
  };
}

export function cleanOrganization(value) {
  return String(value || "").replace(/\s+Primary Contact$/i, "").trim();
}

export function evidenceKey({ period, parcelNumber, organization, assignmentObjectId }) {
  return [String(period || "").slice(0, 7), parcelDigits(parcelNumber), cleanOrganization(organization), String(assignmentObjectId || "")].join("|");
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
      // Read the published Regrid contract rather than hard-coding its
      // narrow historical shape. That keeps optional source fields such as
      // Additional Notes and service date available as soon as the daily
      // Regrid publisher exposes them, while `original_url` is normalized
      // when a publisher provides the original hyperlink target.
      outFields: "*",
      returnGeometry: "false",
      resultRecordCount: String(pageSize),
      resultOffset: String(offset),
      orderByFields: "parcelnumb ASC, created_at ASC"
    });
    const batch = (payload.features || []).map((feature) => normalizeRegridEvidence(feature.attributes || {}));
    records.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return records;
}

export async function fetchSurveyEvidenceForParcel(parcelNumber, periodLabel = null) {
  const digits = parcelDigits(parcelNumber);
  if (!digits) return null;
  const clauses = [`parcelnumb = '${digits.replace(/'/g, "''")}'`];
  if (periodLabel && periodLabel !== "Current") {
    clauses.push(`period_label = '${String(periodLabel).replace(/'/g, "''")}'`);
  }
  const payload = await fetchArcgisJson(`${SURVEY_LAYER_URL}/query`, {
    f: "json",
    where: clauses.join(" AND "),
    // Use the complete public Regrid feature contract so the selected-parcel
    // evidence panel can show service metadata and Additional Notes.
    outFields: "*",
    returnGeometry: "false",
    orderByFields: "created_at DESC",
    resultRecordCount: "50"
  });
  return (payload.features || []).map((feature) => normalizeRegridEvidence(feature.attributes || {}));
}

export async function fetchLatestSurveyEvidenceForParcel(parcelNumber, periodLabel = null) {
  const records = await fetchSurveyEvidenceForParcel(parcelNumber, periodLabel);
  return records[0] || null;
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

export async function fetchSurvey123EvidenceRecordsForPeriod(periodLabel) {
  if (!SURVEY123_EVIDENCE_LAYER_URL) return [];
  const safePeriod = String(periodLabel || "").replace(/'/g, "''");
  const payload = await fetchArcgisJson(`${SURVEY123_EVIDENCE_LAYER_URL}/query`, {
    f: "json",
    where: `service_period = '${safePeriod}'`,
    // The canonical evidence layer is explicitly public-safe. Read its full
    // contract so optional Notes and Service Date fields can be added without
    // breaking older hosted layers.
    outFields: "*",
    returnGeometry: "false",
    orderByFields: "CreationDate DESC",
    resultRecordCount: "2000"
  });
  const records = [];
  for (const feature of payload.features || []) {
    const attrs = feature.attributes || {};
    const objectId = attrs.assignment_id;
    if (objectId == null || !attrs.image_attachment_url) continue;
    const images = [{
      image_url: attrs.image_attachment_url,
      submitted_at: attrs.submitted_at,
      service_date: attrs.service_date,
      additional_notes: attrs.additional_notes,
      evidence_source: "Survey123",
      survey_source: "Survey123",
      attachment_name: attrs.image_attachment_name
    }];
    records.push({
      ...attrs,
      OBJECTID: objectId,
      assignment_object_id: objectId,
      evidence_photos: images
    });
  }
  return records;
}

function assignmentValidationIndex(features) {
  const index = new Set();
  for (const feature of features || []) {
    const props = feature.properties || {};
    const objectId = props.assignment_id ?? props.objectid ?? props.OBJECTID;
    if (objectId == null) continue;
    index.add(evidenceKey({
      period: props.period_month || props.period_label,
      parcelNumber: props.parcel_number || props.parcel_key,
      organization: props.organization,
      assignmentObjectId: objectId
    }));
  }
  return index;
}

export async function loadSurvey123EvidenceByPeriod(periodLabels, assignmentFeatures) {
  const index = assignmentValidationIndex(assignmentFeatures);
  const entries = await Promise.all([...new Set(periodLabels || [])].filter(Boolean).map(async (period) => {
    const records = await fetchSurvey123EvidenceRecordsForPeriod(period).catch(() => []);
    const valid = records.filter((record) => (
      (record.evidence_photos || []).length > 0 &&
      index.has(evidenceKey({
        period: record.assignment_period,
        parcelNumber: record.parcel_number,
        organization: record.organization,
        assignmentObjectId: record.assignment_object_id
      }))
    ));
    return [period, valid];
  }));
  return Object.fromEntries(entries);
}

export async function loadCombinedEvidenceByPeriod(periodLabels, assignmentFeatures) {
  const [regrid, survey123] = await Promise.all([
    loadSurveyEvidenceByPeriod(periodLabels),
    loadSurvey123EvidenceByPeriod(periodLabels, assignmentFeatures)
  ]);
  const combined = {};
  for (const period of new Set([...(periodLabels || []), ...Object.keys(regrid), ...Object.keys(survey123)])) {
    combined[period] = new Set(regrid[period] || []);
    for (const record of survey123[period] || []) combined[period].add(parcelDigits(record.parcel_number));
  }
  return combined;
}

export function survey123EvidenceMatchesAssignment(record, properties) {
  return Boolean(
    (record?.evidence_photos || []).length &&
    evidenceKey({
      period: record.assignment_period,
      parcelNumber: record.parcel_number,
      organization: record.organization,
      assignmentObjectId: record.assignment_object_id
    }) === evidenceKey({
      period: properties?.period_month || properties?.period_label,
      parcelNumber: properties?.parcel_number || properties?.parcel_key,
      organization: properties?.organization,
      assignmentObjectId: properties?.objectid ?? properties?.OBJECTID
    })
  );
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
      survey_evidence_source: SURVEY123_EVIDENCE_LAYER_URL
        ? `ArcGIS Online ${SURVEY_LAYER_NAME} and Survey123 immediate evidence`
        : `ArcGIS Online ${SURVEY_LAYER_NAME}`
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
