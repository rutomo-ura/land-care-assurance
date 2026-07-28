import { dateFromMillis, fetchArcgisJson } from "./survey-layer.js";

export const ASSIGNMENT_CURRENT_LAYER_URL =
  "https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/gisdb_gis_regrid_bundle_assignments_current_period/FeatureServer/0";
export const ASSIGNMENT_CURRENT_AGOL_ITEM_ID = "0b4733cb5d204da6ab936c9f6d49e401";
export const ASSIGNMENT_CURRENT_AGOL_ITEM_URL =
  "https://urap.maps.arcgis.com/home/item.html?id=0b4733cb5d204da6ab936c9f6d49e401";
export const ASSIGNMENT_CURRENT_LAYER_NAME = "gisdb_gis_regrid_bundle_assignments_current_period";

export const ASSIGNMENT_HISTORY_LAYER_URL =
  "https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/gisdb_gis_regrid_bundle_assignments_history/FeatureServer/0";
export const ASSIGNMENT_HISTORY_AGOL_ITEM_ID = "df7d77eb57f14c68b717c2cf3cdaada4";
export const ASSIGNMENT_HISTORY_AGOL_ITEM_URL =
  "https://urap.maps.arcgis.com/home/item.html?id=df7d77eb57f14c68b717c2cf3cdaada4";
export const ASSIGNMENT_HISTORY_LAYER_NAME = "gisdb_gis_regrid_bundle_assignments_history";

const ASSIGNMENT_OUT_FIELDS = [
  "OBJECTID",
  "id",
  "address",
  "parcelnumb",
  "alco_pin",
  "sq_footage",
  "inv_type",
  "prop_class",
  "assigned_to",
  "maintained_by",
  "maintain_level",
  "period",
  "period_label",
  "period_end",
  "service_period_label",
  "is_current_period"
].join(",");

function parcelDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function esriPolygonToGeoJson(geometry) {
  const rings = geometry?.rings;
  if (!Array.isArray(rings) || !rings.length) return null;
  return {
    type: "Polygon",
    coordinates: rings.map((ring) => ring.map((point) => [point[0], point[1]]))
  };
}

function cleanContractor(value) {
  return String(value || "Unassigned").replace(/\s+Primary Contact$/i, "") || "Unassigned";
}

function normalizeMaintenanceLevel(value) {
  const text = String(value || "").trim();
  if (/request/i.test(text)) return "Request Only";
  if (/active/i.test(text)) return "Active";
  return text || "Active";
}

function ownershipGroup(value) {
  const text = String(value || "").trim();
  if (text === "URA" || text === "URA Owned") return "URA";
  if (text === "PLB" || text === "PLB Owned" || text === "Pittsburgh Land Bank") return "PLB";
  return "Other";
}

function normalizeAssignmentFeature(feature, source) {
  const attrs = feature.attributes || {};
  const parcelKey = attrs.parcelnumb || attrs.alco_pin || `ASSIGN-${attrs.OBJECTID}`;
  const maintenanceLevel = normalizeMaintenanceLevel(attrs.maintain_level);
  const periodMonth = String(attrs.period_label || attrs.service_period_label || "").slice(0, 7);
  return {
    type: "Feature",
    geometry: esriPolygonToGeoJson(feature.geometry),
    properties: {
      objectid: attrs.OBJECTID,
      assignment_id: attrs.id ?? attrs.assignment_id ?? attrs.OBJECTID,
      parcel_key: parcelKey,
      parcel_digits: parcelDigits(parcelKey),
      parcel_number: attrs.parcelnumb,
      alco_pin: attrs.alco_pin,
      address: attrs.address,
      period_month: periodMonth,
      period_label: attrs.period_label || periodMonth,
      service_period_label: attrs.service_period_label,
      period_end: dateFromMillis(attrs.period_end),
      is_current_period: Number(attrs.is_current_period || 0) === 1,
      organization: cleanContractor(attrs.maintained_by || attrs.assigned_to),
      organization_contact: attrs.maintained_by || attrs.assigned_to || "Unassigned",
      maintenance_level: maintenanceLevel,
      completion_status: maintenanceLevel === "Request Only" ? "request_only" : "missing",
      returned_flag: false,
      ownership_type: attrs.inv_type || "Assignment layer",
      ownership_group: ownershipGroup(attrs.inv_type),
      inventory_type: attrs.inv_type,
      property_class: attrs.prop_class,
      acreage: Number(attrs.sq_footage || 0) / 43560,
      parcel_sqft: Number(attrs.sq_footage || 0),
      source_layer: source.layerName,
      source_layer_url: source.layerUrl,
      source_layer_item_url: source.itemUrl
    }
  };
}

async function fetchAssignmentLayerFeatures(layerUrl, where = "1=1") {
  const records = [];
  let offset = 0;
  const pageSize = 2000;
  while (true) {
    const payload = await fetchArcgisJson(`${layerUrl}/query`, {
      f: "json",
      where,
      outFields: ASSIGNMENT_OUT_FIELDS,
      returnGeometry: "true",
      outSR: "4326",
      resultRecordCount: String(pageSize),
      resultOffset: String(offset),
      orderByFields: "period_label ASC, maintained_by ASC, parcelnumb ASC"
    });
    const batch = payload.features || [];
    records.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return records;
}

export async function fetchAssignmentLayerMetadata(layerUrl, fallback) {
  const payload = await fetchArcgisJson(layerUrl, { f: "json" });
  return {
    title: payload.name || fallback.layerName,
    recordCount: payload.recordCount,
    dataLastEdit: dateFromMillis(payload.editingInfo?.dataLastEditDate),
    serviceItemId: payload.serviceItemId || fallback.itemId,
    serviceUrl: layerUrl.replace(/\/0$/, ""),
    itemUrl: fallback.itemUrl
  };
}

export async function fetchAssignmentPeriodStats() {
  const payload = await fetchArcgisJson(`${ASSIGNMENT_HISTORY_LAYER_URL}/query`, {
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

export async function fetchAssignmentHistoryGeojson() {
  const features = await fetchAssignmentLayerFeatures(ASSIGNMENT_HISTORY_LAYER_URL);
  return {
    type: "FeatureCollection",
    metadata: {
      source_layer: ASSIGNMENT_HISTORY_LAYER_NAME,
      source_layer_url: ASSIGNMENT_HISTORY_LAYER_URL.replace(/\/0$/, ""),
      source_layer_item_url: ASSIGNMENT_HISTORY_AGOL_ITEM_URL
    },
    features: features.map((feature) =>
      normalizeAssignmentFeature(feature, {
        layerName: ASSIGNMENT_HISTORY_LAYER_NAME,
        layerUrl: ASSIGNMENT_HISTORY_LAYER_URL.replace(/\/0$/, ""),
        itemUrl: ASSIGNMENT_HISTORY_AGOL_ITEM_URL
      })
    )
  };
}

export async function fetchCurrentAssignmentGeojson() {
  const features = await fetchAssignmentLayerFeatures(ASSIGNMENT_CURRENT_LAYER_URL);
  return {
    type: "FeatureCollection",
    metadata: {
      source_layer: ASSIGNMENT_CURRENT_LAYER_NAME,
      source_layer_url: ASSIGNMENT_CURRENT_LAYER_URL.replace(/\/0$/, ""),
      source_layer_item_url: ASSIGNMENT_CURRENT_AGOL_ITEM_URL
    },
    features: features.map((feature) =>
      normalizeAssignmentFeature(feature, {
        layerName: ASSIGNMENT_CURRENT_LAYER_NAME,
        layerUrl: ASSIGNMENT_CURRENT_LAYER_URL.replace(/\/0$/, ""),
        itemUrl: ASSIGNMENT_CURRENT_AGOL_ITEM_URL
      })
    )
  };
}

export function enrichSummaryWithAssignmentLayers(summary, currentMetadata, historyMetadata, periodStats) {
  const assignmentPeriods = (periodStats || []).map((row) => row.period_label).filter(Boolean);
  return {
    ...summary,
    latest_month: assignmentPeriods.at(-1) || summary?.latest_month,
    latest_assignment_period: assignmentPeriods.at(-1) || summary?.latest_assignment_period,
    available_months: [...new Set([...(summary?.available_months || []), ...assignmentPeriods])].sort(),
    assignment_layer_summary: {
      current_period: currentMetadata,
      history: historyMetadata,
      available_periods: assignmentPeriods
    }
  };
}
