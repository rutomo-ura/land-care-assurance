import {
  ASSIGNMENT_HISTORY_LAYER_URL,
  SURVEY123_PREFILL_FIELDS,
  SURVEY123_SHARE_URL
} from "./survey-submission-config.js";
import Map from "https://js.arcgis.com/4.30/@arcgis/core/Map.js";
import MapView from "https://js.arcgis.com/4.30/@arcgis/core/views/MapView.js";
import Graphic from "https://js.arcgis.com/4.30/@arcgis/core/Graphic.js";

const container = document.getElementById("surveyEmbed");
const link = document.getElementById("openSurveyLink");
const lookupForm = document.getElementById("assignmentLookupForm");
const monthSelect = document.getElementById("assignmentMonth");
const organizationSelect = document.getElementById("assignmentOrganization");
const parcelSelect = document.getElementById("assignmentParcel");
const continueButton = document.getElementById("continueToSurvey");
const status = document.getElementById("assignmentLookupStatus");
const parcelMapNode = document.getElementById("assignmentParcelMap");
const selectedParcelLabel = document.getElementById("selectedParcelLabel");
const selectedParcelBadge = document.getElementById("selectedParcelBadge");
const selectedParcelMeta = document.getElementById("selectedParcelMeta");

let assignments = [];
let parcelMapView;
let selectedParcelGraphic;
let selectedParcelLabelGraphic;
let availableParcelGraphics = [];
let selectedAssignment;
const PARCEL_LABEL_SCALE = 5000;

function isSurvey123Url(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)survey123\.arcgis\.com$/i.test(url.hostname) && /\/share\//.test(url.pathname);
  } catch {
    return false;
  }
}

function escapeSqlText(value) {
  return String(value || "").replace(/'/g, "''");
}

function cleanOrganization(value) {
  return String(value || "").replace(/\s+Primary Contact$/i, "").trim();
}

function periodWhere(extra = "1=1") {
  return `period_label = '${escapeSqlText(monthSelect.value)}' AND ${extra}`;
}

function coordinateFallback(geometry) {
  const center = geometry?.extent?.center;
  const latitude = center?.latitude ?? center?.y;
  const longitude = center?.longitude ?? center?.x;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "Location not listed";
  return `Coordinates ${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`;
}

function normalizeAssignmentGeometry(geometry) {
  if (!geometry?.rings) return geometry || null;
  // A few historical bundle rows encode ring vertices as "longitude latitude"
  // strings. ArcGIS MapView cannot draw those directly, even though the parcel
  // boundary is present in the assignment service.
  const rings = geometry.rings.map((ring) => ring.map((point) => {
    if (!Array.isArray(point)) return String(point || "").trim().split(/\s+/).map(Number);
    return point.map(Number);
  }));
  const valid = rings.every((ring) => ring.every((point) => (
    point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1])
  )));
  // REST query geometry omits the `type` and often spatial reference. Supply
  // both so ArcGIS can construct an extent and render the selected boundary.
  return valid
    ? { type: "polygon", spatialReference: { wkid: 4326 }, ...geometry, rings }
    : null;
}

function polygonCenter(geometry) {
  const points = geometry?.rings?.flat?.(1) || [];
  const coordinates = points.filter((point) => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])));
  if (!coordinates.length) return null;
  const xs = coordinates.map((point) => Number(point[0]));
  const ys = coordinates.map((point) => Number(point[1]));
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

function parcelLabelGraphic(assignment, { selected = false } = {}) {
  const center = polygonCenter(assignment.geometry);
  if (!center) return null;
  return new Graphic({
    geometry: { type: "point", longitude: center[0], latitude: center[1], spatialReference: { wkid: 4326 } },
    attributes: { assignmentObjectId: assignment.objectId, parcelLabel: true, selected },
    symbol: {
      type: "text",
      color: selected ? "#00334f" : "#17212b",
      haloColor: "#ffffff",
      haloSize: selected ? 1.7 : 1.35,
      // The selected boundary and confirmation card already communicate state.
      // Keep a single parcel number on the map rather than stacking a second
      // "SELECTED" label over the regular zoom label.
      text: assignment.parcelNumber,
      font: { family: "Arial", size: selected ? 10 : 9, weight: "bold" },
      yoffset: selected ? 12 : 4
    }
  });
}

function syncAvailableParcelLabels() {
  if (!parcelMapView) return;
  const showLabels = parcelMapView.scale <= PARCEL_LABEL_SCALE;
  availableParcelGraphics.filter((graphic) => graphic.attributes?.parcelLabel)
    .forEach((graphic) => {
      // A selected parcel has its own persistent label. Hide its ordinary
      // zoom-level label so the two labels can never overlap.
      graphic.visible = showLabels && graphic.attributes.assignmentObjectId !== selectedAssignment?.objectId;
    });
}

function setOptions(select, options, placeholder) {
  select.replaceChildren(new Option(placeholder, ""), ...options.map(({ label, value }) => new Option(label, value)));
}

async function fetchJson(url, params) {
  const request = new URL(url);
  Object.entries(params).forEach(([key, value]) => request.searchParams.set(key, value));
  const response = await fetch(request);
  if (!response.ok) throw new Error(`Assignment service returned ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "Assignment service is unavailable");
  return payload;
}

async function initializeParcelMap() {
  parcelMapView = new MapView({
    container: parcelMapNode,
    map: new Map({ basemap: "gray-vector" }),
    center: [-80.0, 40.44],
    zoom: 11,
    ui: { components: ["zoom"] }
  });
  await parcelMapView.when();
  parcelMapView.watch("scale", syncAvailableParcelLabels);
  parcelMapView.on("click", async (event) => {
    const hit = await parcelMapView.hitTest(event).catch(() => null);
    const graphic = hit?.results
      .map((result) => result.graphic)
      .find((item) => item?.attributes?.assignmentObjectId);
    if (graphic?.attributes?.assignmentObjectId) selectAssignment(graphic.attributes.assignmentObjectId, { fromMap: true });
  });
  if (selectedAssignment) showSelectedParcel(selectedAssignment);
  else showAvailableParcels();
}

function clearAvailableParcels() {
  if (!parcelMapView) return;
  availableParcelGraphics.forEach((graphic) => parcelMapView.graphics.remove(graphic));
  availableParcelGraphics = [];
}

function showAvailableParcels() {
  clearAvailableParcels();
  if (!parcelMapView) return;
  if (selectedParcelGraphic) parcelMapView.graphics.remove(selectedParcelGraphic);
  if (selectedParcelLabelGraphic) parcelMapView.graphics.remove(selectedParcelLabelGraphic);
  selectedParcelGraphic = null;
  selectedParcelLabelGraphic = null;
  selectedAssignment = null;
  availableParcelGraphics = assignments
    .filter((assignment) => assignment.geometry)
    .flatMap((assignment) => {
      const parcel = new Graphic({
        geometry: assignment.geometry,
        attributes: { assignmentObjectId: assignment.objectId },
        symbol: {
          type: "simple-fill",
          color: [0, 152, 211, 0.08],
          outline: { color: "#007eae", width: 1.5 }
        }
      });
      const label = parcelLabelGraphic(assignment);
      return label ? [parcel, label] : [parcel];
    });
  availableParcelGraphics.forEach((graphic) => parcelMapView.graphics.add(graphic));
  if (!availableParcelGraphics.length) return;
  selectedParcelLabel.textContent = "Tap an outlined parcel on the map or use the list";
  selectedParcelBadge.hidden = true;
  selectedParcelMeta.textContent = "Every outline is assigned to the selected organization. Tap a parcel to select it for this service record.";
  parcelMapView.goTo(availableParcelGraphics, { duration: 450 }).catch(() => {});
  syncAvailableParcelLabels();
}

function showSelectedParcel(assignment) {
  selectedAssignment = assignment;
  if (!parcelMapView || !assignment?.geometry) return;
  if (selectedParcelGraphic) parcelMapView.graphics.remove(selectedParcelGraphic);
  if (selectedParcelLabelGraphic) parcelMapView.graphics.remove(selectedParcelLabelGraphic);
  selectedParcelGraphic = new Graphic({
    geometry: assignment.geometry,
    symbol: {
      type: "simple-fill",
      color: [0, 152, 211, 0.34],
      outline: { color: "#006c9f", width: 4 }
    }
  });
  selectedParcelLabelGraphic = parcelLabelGraphic(assignment, { selected: true });
  parcelMapView.graphics.add(selectedParcelGraphic);
  if (selectedParcelLabelGraphic?.geometry) parcelMapView.graphics.add(selectedParcelLabelGraphic);
  syncAvailableParcelLabels();
  parcelMapView.goTo(assignment.geometry.extent?.expand(1.55) || selectedParcelGraphic, { duration: 450 }).catch(() => {});
  selectedParcelLabel.textContent = `${assignment.parcelNumber} - ${assignment.address}`;
  selectedParcelBadge.hidden = false;
  selectedParcelBadge.textContent = `Selected parcel · ${assignment.parcelNumber}`;
  selectedParcelMeta.textContent = `Bright blue boundary = this service record. ${assignment.address} · ${cleanOrganization(assignment.organization)} · ${assignment.period} · ${assignment.coordinateLabel}`;
}

function selectAssignment(objectId, { fromMap = false } = {}) {
  const assignment = assignments.find((item) => item.objectId === String(objectId));
  if (!assignment) return;
  parcelSelect.value = assignment.objectId;
  continueButton.disabled = false;
  status.textContent = `${assignment.parcelNumber} - ${assignment.address} - ${assignment.period}${fromMap ? " (selected on map)" : ""}`;
  showSelectedParcel(assignment);
}

async function loadRecentMonths() {
  const payload = await fetchJson(`${ASSIGNMENT_HISTORY_LAYER_URL}/query`, {
    f: "json",
    where: "period_label IS NOT NULL",
    outFields: "period_label",
    returnGeometry: "false",
    returnDistinctValues: "true",
    orderByFields: "period_label DESC"
  });
  const months = [...new Set((payload.features || []).map(({ attributes }) => attributes?.period_label).filter(Boolean))].slice(0, 2);
  if (!months.length) throw new Error("No assignment periods were returned");
  setOptions(monthSelect, months.map((month, index) => ({
    value: month,
    label: index === 0 ? `${month} - current period` : `${month} - prior period`
  })), "Choose assignment month");
  monthSelect.value = months[0];
  monthSelect.disabled = false;
}

async function loadOrganizations() {
  const payload = await fetchJson(`${ASSIGNMENT_HISTORY_LAYER_URL}/query`, {
    f: "json",
    where: periodWhere("maintained_by IS NOT NULL"),
    outFields: "maintained_by",
    returnGeometry: "false",
    returnDistinctValues: "true",
    orderByFields: "maintained_by ASC"
  });
  const organizations = [...new Set((payload.features || []).map(({ attributes }) => attributes?.maintained_by).filter(Boolean))]
    .map((value) => ({ label: cleanOrganization(value), value }))
    .sort((left, right) => left.label.localeCompare(right.label));
  if (!organizations.length) throw new Error("No organization assignments were returned for this month");
  setOptions(organizationSelect, organizations, "Choose your organization");
  organizationSelect.disabled = false;
  status.textContent = `${organizations.length} organizations in the ${monthSelect.value} assignment bundle.`;
}

async function loadParcels(organization) {
  parcelSelect.disabled = true;
  continueButton.disabled = true;
  setOptions(parcelSelect, [], "Loading assigned parcels...");
  status.textContent = "Loading parcels assigned to this organization...";
  const payload = await fetchJson(`${ASSIGNMENT_HISTORY_LAYER_URL}/query`, {
    f: "json",
    where: periodWhere(`maintained_by = '${escapeSqlText(organization)}'`),
    outFields: "OBJECTID,parcelnumb,alco_pin,address,period_label,service_period_label,maintain_level,maintained_by",
    returnGeometry: "true",
    outSR: "4326",
    orderByFields: "address ASC, parcelnumb ASC",
    resultRecordCount: "2000"
  });
  assignments = (payload.features || [])
    .map(({ attributes, geometry }) => {
      const parcelGeometry = normalizeAssignmentGeometry(geometry);
      return {
      objectId: String(attributes.OBJECTID),
      assignmentId: String(attributes.assignment_id ?? attributes.OBJECTID),
      address: attributes.address || coordinateFallback(parcelGeometry),
      coordinateLabel: coordinateFallback(parcelGeometry),
      organization: attributes.maintained_by || organization,
      parcelNumber: attributes.parcelnumb || attributes.alco_pin || "Parcel not listed",
      period: attributes.period_label || attributes.service_period_label || monthSelect.value,
      maintenanceLevel: attributes.maintain_level || "Active",
      geometry: parcelGeometry
    };
    })
    .filter((assignment) => !/request/i.test(assignment.maintenanceLevel));
  setOptions(parcelSelect, assignments.map((assignment) => ({
    value: assignment.objectId,
    label: `${assignment.parcelNumber} - ${assignment.address}`
  })), assignments.length ? "Choose an assigned parcel" : "No active parcels assigned");
  parcelSelect.disabled = assignments.length === 0;
  showAvailableParcels();
  status.textContent = assignments.length
    ? `${assignments.length} active parcel${assignments.length === 1 ? "" : "s"} assigned for ${monthSelect.value}. Choose from the map or the list.`
    : "No active parcels were found for this organization in the selected assignment month.";
}

function buildSurveyUrl(assignment) {
  const url = new URL(SURVEY123_SHARE_URL);
  url.searchParams.set("embed", "1");
  url.searchParams.set("hideNav", "1");
  url.searchParams.set("autoFocus", "0");
  url.searchParams.set(`field:${SURVEY123_PREFILL_FIELDS.organization}`, cleanOrganization(assignment.organization));
  url.searchParams.set(`field:${SURVEY123_PREFILL_FIELDS.parcelNumber}`, assignment.parcelNumber);
  url.searchParams.set(`field:${SURVEY123_PREFILL_FIELDS.address}`, assignment.address);
  url.searchParams.set(`field:${SURVEY123_PREFILL_FIELDS.assignmentPeriod}`, assignment.period);
  // The public assignment layer exposes OBJECTID as the stable browser-side
  // feature identifier. Canonical evidence matching validates it separately.
  url.searchParams.set(`field:${SURVEY123_PREFILL_FIELDS.assignmentObjectId}`, assignment.assignmentId);
  const center = polygonCenter(assignment.geometry);
  if (center) {
    const [longitude, latitude] = center;
    url.searchParams.set(`field:${SURVEY123_PREFILL_FIELDS.parcelLocation}`, `${latitude} ${longitude}`);
    url.searchParams.set("center", `${latitude},${longitude}`);
    url.searchParams.set("hide", `field:${SURVEY123_PREFILL_FIELDS.parcelLocation},field:${SURVEY123_PREFILL_FIELDS.assignmentObjectId}`);
  }
  return url;
}

monthSelect.addEventListener("change", async () => {
  assignments = [];
  clearAvailableParcels();
  organizationSelect.disabled = true;
  parcelSelect.disabled = true;
  continueButton.disabled = true;
  setOptions(parcelSelect, [], "Choose an organization first");
  status.textContent = `Loading organizations for ${monthSelect.value}...`;
  try {
    await loadOrganizations();
  } catch (error) {
    status.textContent = `Unable to load organizations: ${error.message}`;
  }
});

organizationSelect.addEventListener("change", async () => {
  if (!organizationSelect.value) {
    assignments = [];
    clearAvailableParcels();
    setOptions(parcelSelect, [], "Choose an organization first");
    parcelSelect.disabled = true;
    continueButton.disabled = true;
    return;
  }
  try {
    await loadParcels(organizationSelect.value);
  } catch (error) {
    assignments = [];
    setOptions(parcelSelect, [], "Unable to load parcels");
    status.textContent = `Unable to load assigned parcels: ${error.message}`;
  }
});

parcelSelect.addEventListener("change", () => {
  if (!parcelSelect.value) {
    continueButton.disabled = true;
    return;
  }
  selectAssignment(parcelSelect.value);
});

lookupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const assignment = assignments.find((item) => item.objectId === parcelSelect.value);
  if (!assignment || !isSurvey123Url(SURVEY123_SHARE_URL)) return;
  const surveyUrl = buildSurveyUrl(assignment);
  const frame = document.createElement("iframe");
  frame.title = "LandCare Network service submission";
  frame.src = surveyUrl.toString();
  frame.loading = "eager";
  frame.allow = "geolocation; camera; microphone";
  container.replaceChildren(frame);
  link.href = surveyUrl.toString();
  link.hidden = false;
  status.textContent = "Assignment carried into the service form. Complete the checklist and required photo evidence.";
  container.scrollIntoView({ behavior: "smooth", block: "start" });
});

loadRecentMonths()
  .then(loadOrganizations)
  .catch((error) => {
    organizationSelect.disabled = true;
    monthSelect.disabled = true;
    status.textContent = `Unable to load the assignment bundle: ${error.message}`;
  });

initializeParcelMap().catch(() => {
  selectedParcelMeta.textContent = "The parcel map could not load. The assignment lookup remains available.";
});
