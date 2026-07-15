import {
  ASSIGNMENT_CURRENT_LAYER_URL,
  SURVEY123_PREFILL_FIELDS,
  SURVEY123_SHARE_URL
} from "./survey-submission-config.js";
import Map from "https://js.arcgis.com/4.30/@arcgis/core/Map.js";
import MapView from "https://js.arcgis.com/4.30/@arcgis/core/views/MapView.js";
import Graphic from "https://js.arcgis.com/4.30/@arcgis/core/Graphic.js";

const container = document.getElementById("surveyEmbed");
const link = document.getElementById("openSurveyLink");
const lookupForm = document.getElementById("assignmentLookupForm");
const organizationSelect = document.getElementById("assignmentOrganization");
const parcelSelect = document.getElementById("assignmentParcel");
const continueButton = document.getElementById("continueToSurvey");
const status = document.getElementById("assignmentLookupStatus");
const parcelMapNode = document.getElementById("assignmentParcelMap");
const selectedParcelLabel = document.getElementById("selectedParcelLabel");
const selectedParcelMeta = document.getElementById("selectedParcelMeta");
let assignments = [];
let parcelMapView;
let selectedParcelGraphic;
let selectedAssignment;

async function initializeParcelMap() {
  const map = new Map({ basemap: "gray-vector" });
  parcelMapView = new MapView({
    container: parcelMapNode,
    map,
    center: [-80.0, 40.44],
    zoom: 11,
    ui: { components: ["zoom"] }
  });
  await parcelMapView.when();
  if (selectedAssignment) showSelectedParcel(selectedAssignment);
}

function showSelectedParcel(assignment) {
  selectedAssignment = assignment;
  if (!parcelMapView || !assignment?.geometry) return;
  if (selectedParcelGraphic) parcelMapView.graphics.remove(selectedParcelGraphic);
  selectedParcelGraphic = new Graphic({
    geometry: assignment.geometry,
    symbol: {
      type: "simple-fill",
      color: [0, 152, 211, 0.2],
      outline: { color: "#00334f", width: 2.5 }
    },
    attributes: assignment
  });
  parcelMapView.graphics.add(selectedParcelGraphic);
  parcelMapView.goTo({ target: selectedParcelGraphic, zoom: 18 }, { duration: 450 }).catch(() => {});
  selectedParcelLabel.textContent = `${assignment.parcelNumber} · ${assignment.address}`;
  selectedParcelMeta.textContent = `${cleanOrganization(assignment.organization)} · ${assignment.period} · official assigned parcel boundary`;
}

function isSurvey123Url(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)survey123\.arcgis\.com$/i.test(url.hostname) && /\/share\//.test(url.pathname);
  } catch {
    return false;
  }
}

function showSurveyPlaceholder() {
  container.innerHTML = `
    <div class="survey-embed-message survey-embed-config">
      <strong>Select an assigned parcel above</strong>
      <p>The service form will open with that parcel and address already populated.</p>
    </div>`;
}

function escapeSqlText(value) {
  return String(value || "").replace(/'/g, "''");
}

function cleanOrganization(value) {
  return String(value || "").replace(/\s+Primary Contact$/i, "").trim();
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

async function loadOrganizations() {
  const payload = await fetchJson(`${ASSIGNMENT_CURRENT_LAYER_URL}/query`, {
    f: "json",
    where: "is_current_period = 1 AND maintained_by IS NOT NULL",
    outFields: "maintained_by",
    returnGeometry: "false",
    returnDistinctValues: "true",
    orderByFields: "maintained_by ASC"
  });
  const organizations = [...new Set((payload.features || []).map(({ attributes }) => attributes?.maintained_by).filter(Boolean))]
    .map((value) => ({ label: cleanOrganization(value), value }))
    .sort((left, right) => left.label.localeCompare(right.label));
  if (!organizations.length) throw new Error("No current organization assignments were returned");
  setOptions(organizationSelect, organizations, "Choose your organization");
  organizationSelect.disabled = false;
  status.textContent = `${organizations.length} organizations in the current monthly assignment bundle.`;
}

async function loadParcels(organization) {
  parcelSelect.disabled = true;
  continueButton.disabled = true;
  setOptions(parcelSelect, [], "Loading assigned parcels…");
  status.textContent = "Loading parcels assigned to this organization…";
  const where = `is_current_period = 1 AND maintained_by = '${escapeSqlText(organization)}'`;
  const payload = await fetchJson(`${ASSIGNMENT_CURRENT_LAYER_URL}/query`, {
    f: "json",
    where,
    outFields: "OBJECTID,parcelnumb,alco_pin,address,period_label,service_period_label,maintain_level,maintained_by",
    returnGeometry: "true",
    outSR: "4326",
    orderByFields: "address ASC, parcelnumb ASC",
    resultRecordCount: "2000"
  });
  assignments = (payload.features || [])
    .map(({ attributes, geometry }) => ({
      objectId: String(attributes.OBJECTID),
      address: attributes.address || "Address not listed",
      organization: attributes.maintained_by || organization,
      parcelNumber: attributes.parcelnumb || attributes.alco_pin || "Parcel not listed",
      period: attributes.period_label || attributes.service_period_label || "Current period",
      maintenanceLevel: attributes.maintain_level || "Active",
      geometry
    }))
    .filter((assignment) => !/request/i.test(assignment.maintenanceLevel));
  setOptions(parcelSelect, assignments.map((assignment) => ({
    value: assignment.objectId,
    label: `${assignment.parcelNumber} — ${assignment.address}`
  })), assignments.length ? "Choose an assigned parcel" : "No active parcels assigned");
  parcelSelect.disabled = assignments.length === 0;
  status.textContent = assignments.length
    ? `${assignments.length} active parcel${assignments.length === 1 ? "" : "s"} assigned for the current service period.`
    : "No active parcels were found for this organization in the current assignment bundle.";
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
  return url;
}

organizationSelect.addEventListener("change", async () => {
  if (!organizationSelect.value) {
    assignments = [];
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
  continueButton.disabled = !parcelSelect.value;
  const assignment = assignments.find((item) => item.objectId === parcelSelect.value);
  if (assignment) status.textContent = `${assignment.parcelNumber} · ${assignment.address} · ${assignment.period}`;
  if (assignment) showSelectedParcel(assignment);
});

lookupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const assignment = assignments.find((item) => item.objectId === parcelSelect.value);
  if (!assignment) return;
  if (!isSurvey123Url(SURVEY123_SHARE_URL)) {
    status.textContent = "Parcel selected. Publish the Survey123 form and add its share URL to connect this verified assignment to the service form.";
    return;
  }
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

loadOrganizations().catch((error) => {
  organizationSelect.disabled = true;
  status.textContent = `Unable to load the current assignment bundle: ${error.message}`;
});

if (!isSurvey123Url(SURVEY123_SHARE_URL)) showSurveyPlaceholder();

initializeParcelMap().catch(() => {
  selectedParcelMeta.textContent = "The parcel map could not load. The assignment lookup remains available.";
});
