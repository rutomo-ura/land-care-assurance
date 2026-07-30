import Map from "https://js.arcgis.com/4.30/@arcgis/core/Map.js";
import MapView from "https://js.arcgis.com/4.30/@arcgis/core/views/MapView.js";
import Graphic from "https://js.arcgis.com/4.30/@arcgis/core/Graphic.js";
import GraphicsLayer from "https://js.arcgis.com/4.30/@arcgis/core/layers/GraphicsLayer.js";
import BasemapToggle from "https://js.arcgis.com/4.30/@arcgis/core/widgets/BasemapToggle.js";
import Zoom from "https://js.arcgis.com/4.30/@arcgis/core/widgets/Zoom.js";
import { fetchAssignmentGeojsonForPeriod } from "./assignment-layer.js?v=20260730-contractor-portal";
import {
  cleanOrganization,
  fetchArcgisJson,
  fetchSurveyRecordsForPeriod,
  loadSurvey123EvidenceByPeriod,
  parcelDigits,
  survey123EvidenceMatchesAssignment
} from "./survey-layer.js?v=20260730-evidence-details";

const monthSelect = document.getElementById("assignmentMonth");
const organizationSelect = document.getElementById("assignmentOrganization");
const parcelSelect = document.getElementById("assignmentParcel");
const mapNode = document.getElementById("contractorProgressMap");
const detailNode = document.getElementById("contractorParcelDetail");
const titleNode = document.getElementById("contractorOverviewTitle");
const freshnessNode = document.getElementById("contractorFreshness");
const assignedNode = document.getElementById("contractorAssignedKpi");
const submittedNode = document.getElementById("contractorSubmittedKpi");
const openNode = document.getElementById("contractorOpenKpi");
const rateNode = document.getElementById("contractorRate");
const rateValueNode = document.getElementById("contractorRateValue");
const rateBarNode = document.getElementById("contractorRateBar");
const mapCardNode = document.getElementById("contractorMapCard");
const listCardNode = document.getElementById("contractorListCard");
const listNode = document.getElementById("contractorParcelList");
const listSummaryNode = document.getElementById("contractorListSummary");
const listTitleNode = document.getElementById("contractorListTitle");

const EPP_PARCEL_LAYER_URL =
  "https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/gisdb_gis_epp_parcels_full/FeatureServer/0";
const state = {
  month: "",
  organization: "",
  selectedObjectId: "",
  map: null,
  view: null,
  layer: null,
  features: [],
  statusFilter: "all",
  overviewView: "map",
  listSort: { key: "block_lot", direction: "asc" },
  parcelReference: new Map()
};
const labelScale = 5000;

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function blockLot(value) {
  const raw = String(value || "").trim().toUpperCase();
  const blockLotMatch = raw.match(/^0*(\d+)\s*-?\s*([A-Z])\s*-?\s*0*(\d+)$/);
  if (blockLotMatch) return `${Number(blockLotMatch[1])}-${blockLotMatch[2]}-${Number(blockLotMatch[3])}`;
  const pin = parcelDigits(value);
  if (!/^[0-9]{4}[A-Z][0-9]{5}/.test(pin)) return pin || "Parcel";
  return `${Number(pin.slice(0, 4))}-${pin[4]}-${Number(pin.slice(5, 10))}`;
}

function featureBlockLot(feature) {
  const props = feature.properties || {};
  return blockLot(props.block_lot || props.parcel_number || props.parcel_key);
}

function statusFor(feature) {
  return feature.properties?.returned_flag ? "submitted" : "open";
}

function visibleFeatures() {
  return state.statusFilter === "all"
    ? state.features
    : state.features.filter((feature) => statusFor(feature) === state.statusFilter);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function dateLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function setEmptyState(message) {
  titleNode.textContent = message;
  assignedNode.textContent = "--";
  submittedNode.textContent = "--";
  openNode.textContent = "--";
  rateNode.hidden = true;
  detailNode.textContent = "Choose an organization, then select an open parcel to begin its service submission.";
  state.layer?.removeAll();
  renderList();
}

function featureGeometry(feature) {
  const rings = feature?.geometry?.coordinates;
  if (!Array.isArray(rings) || !rings.length) return null;
  return { type: "polygon", rings, spatialReference: { wkid: 4326 } };
}

function symbolFor(feature) {
  const selected = String(feature.properties.objectid) === state.selectedObjectId;
  const returned = feature.properties.returned_flag;
  return {
    type: "simple-fill",
    color: returned ? [46, 125, 50, 0.76] : [255, 255, 255, 0.66],
    outline: { color: selected ? "#007eae" : returned ? "#1c5a29" : "#7b8790", width: selected ? 3 : 1.15 }
  };
}

function labelGraphic(feature) {
  const geometry = featureGeometry(feature);
  const points = (geometry?.rings || []).flat().filter((point) => (
    Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
  ));
  const center = points.length
    ? {
        type: "point",
        longitude: (Math.min(...points.map((point) => Number(point[0]))) + Math.max(...points.map((point) => Number(point[0])))) / 2,
        latitude: (Math.min(...points.map((point) => Number(point[1]))) + Math.max(...points.map((point) => Number(point[1])))) / 2,
        spatialReference: { wkid: 4326 }
      }
    : null;
  if (!center) return null;
  const selected = String(feature.properties.objectid) === state.selectedObjectId;
  const graphic = new Graphic({
    geometry: center,
    attributes: { label: true, assignmentObjectId: String(feature.properties.objectid) },
    symbol: {
      type: "text",
      text: featureBlockLot(feature),
      color: "#102433",
      haloColor: "#ffffff",
      haloSize: selected ? 2 : 1.3,
      font: { family: "Arial", size: selected ? 10 : 9, weight: "bold" },
      yoffset: selected ? 11 : 4
    }
  });
  graphic.visible = selected || state.view?.scale <= labelScale;
  return graphic;
}

function renderMap() {
  if (!state.layer) return;
  state.layer.removeAll();
  const graphics = [];
  for (const feature of visibleFeatures()) {
    const geometry = featureGeometry(feature);
    if (!geometry) continue;
    graphics.push(new Graphic({
      geometry,
      attributes: { ...feature.properties, assignmentObjectId: String(feature.properties.objectid) },
      symbol: symbolFor(feature)
    }));
    const label = labelGraphic(feature);
    if (label) graphics.push(label);
  }
  state.layer.addMany(graphics);
}

function renderList() {
  if (!listNode) return;
  const features = [...visibleFeatures()].sort((left, right) => {
    const leftProps = left.properties || {};
    const rightProps = right.properties || {};
    const key = state.listSort.key;
    const leftValue = key === "block_lot" ? featureBlockLot(left) : key === "status" ? statusFor(left) : leftProps[key] || "";
    const rightValue = key === "block_lot" ? featureBlockLot(right) : key === "status" ? statusFor(right) : rightProps[key] || "";
    return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" }) *
      (state.listSort.direction === "asc" ? 1 : -1);
  });
  listTitleNode.textContent = state.statusFilter === "all" ? "All assigned parcels" : `${state.statusFilter === "submitted" ? "Submitted" : "Open"} parcels`;
  listSummaryNode.textContent = state.organization
    ? `${formatNumber(features.length)} shown · sorted by ${state.listSort.key === "block_lot" ? "block & lot" : state.listSort.key.replace("_", " ")}`
    : "Choose an organization to view assigned parcels.";
  listNode.innerHTML = features.length
    ? features.map((feature) => {
      const props = feature.properties || {};
      const submitted = statusFor(feature) === "submitted";
      const selected = String(props.objectid) === state.selectedObjectId;
      return `<tr class="${selected ? "is-selected" : ""}">
        <td><strong>${escapeHtml(featureBlockLot(feature))}</strong></td>
        <td>${escapeHtml(props.address || "Address unavailable")}</td>
        <td>${escapeHtml(props.council_district || "—")}</td>
        <td><span class="contractor-status-pill ${submitted ? "submitted" : "open"}">${submitted ? "Submitted" : "Open"}</span>${submitted && props.submitted_at ? `<small>${escapeHtml(dateLabel(props.submitted_at))}</small>` : ""}</td>
        <td><button type="button" class="contractor-list-select" data-contractor-list-id="${escapeHtml(props.objectid)}">${submitted ? "View map" : "Submit service"}</button></td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="5" class="contractor-list-empty">No ${state.statusFilter === "all" ? "assigned" : state.statusFilter} parcels match this view.</td></tr>`;
}

function renderOverview() {
  renderMap();
  renderList();
  document.querySelectorAll("[data-contractor-status]").forEach((button) => {
    const active = button.dataset.contractorStatus === state.statusFilter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function updateLabelVisibility() {
  state.layer?.graphics.filter((graphic) => graphic.attributes?.label).forEach((graphic) => {
    graphic.visible = graphic.attributes.assignmentObjectId === state.selectedObjectId || state.view.scale <= labelScale;
  });
}

function selectFeature(feature, { openSubmit = false } = {}) {
  if (!feature) return;
  state.selectedObjectId = String(feature.properties.objectid);
  renderOverview();
  const props = feature.properties;
  const status = props.returned_flag ? "Submitted" : "Open";
  detailNode.innerHTML = `<strong>${featureBlockLot(feature)}</strong> &middot; ${props.address || "Address unavailable"}<br><span>${status}${props.submitted_at ? ` &middot; submitted ${dateLabel(props.submitted_at)}` : ""}</span>${props.returned_flag ? "" : "<br><button type=\"button\" class=\"contractor-submit-parcel\">Submit service for this parcel</button>"}`;
  const button = detailNode.querySelector(".contractor-submit-parcel");
  if (button) button.addEventListener("click", () => selectForSubmission(feature));
  if (openSubmit && !props.returned_flag) selectForSubmission(feature);
}

function selectForSubmission(feature) {
  const objectId = String(feature.properties.objectid);
  if ([...parcelSelect.options].some((option) => option.value === objectId)) {
    parcelSelect.value = objectId;
    parcelSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }
  setTab("submit");
}

function setTab(tab) {
  const selected = tab === "submit" ? "submit" : "overview";
  document.querySelectorAll("[data-contractor-tab]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.contractorTab === selected);
  });
  document.querySelectorAll("[data-contractor-panel]").forEach((panel) => {
    const active = panel.dataset.contractorPanel === selected;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  const url = new URL(window.location.href);
  url.searchParams.set("tab", selected);
  history.replaceState({}, "", url);
  if (selected === "overview") state.view?.resize();
}

function setOverviewView(view) {
  state.overviewView = view === "list" ? "list" : "map";
  const showList = state.overviewView === "list";
  mapCardNode.hidden = showList;
  listCardNode.hidden = !showList;
  document.querySelectorAll("[data-contractor-view]").forEach((button) => {
    const active = button.dataset.contractorView === state.overviewView;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  if (!showList) requestAnimationFrame(() => state.view?.resize());
}

function syncUrlContext() {
  const url = new URL(window.location.href);
  if (state.month) url.searchParams.set("month", state.month);
  if (state.organization) url.searchParams.set("organization", state.organization);
  history.replaceState({}, "", url);
}

function applyEvidence(features, surveyRows, survey123Rows) {
  const activeFeatures = features.filter((feature) => feature.properties.maintenance_level === "Active");
  const assignmentPins = new Set(activeFeatures.map((feature) => parcelDigits(feature.properties.parcel_key)).filter(Boolean));
  const regridMatches = surveyRows.filter((row) => assignmentPins.has(parcelDigits(row.parcelnumb)));
  const regridPins = new Set(regridMatches.map((row) => parcelDigits(row.parcelnumb)));
  const survey123AssignmentIds = new Set();
  for (const evidence of survey123Rows) {
    const match = activeFeatures.find((feature) => survey123EvidenceMatchesAssignment(evidence, feature.properties));
    if (match) survey123AssignmentIds.add(String(match.properties.objectid));
  }
  const returnedIds = new Set(activeFeatures
    .filter((feature) => regridPins.has(parcelDigits(feature.properties.parcel_key)))
    .map((feature) => String(feature.properties.objectid)));
  survey123AssignmentIds.forEach((id) => returnedIds.add(id));
  const survey123Only = [...survey123AssignmentIds].filter((id) => !regridPins.has(parcelDigits(
    activeFeatures.find((feature) => String(feature.properties.objectid) === id)?.properties.parcel_key
  ))).length;
  const enriched = activeFeatures.map((feature) => {
    const returned = returnedIds.has(String(feature.properties.objectid));
    const latestSurvey = surveyRows
      .filter((row) => parcelDigits(row.parcelnumb) === parcelDigits(feature.properties.parcel_key))
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
    return { ...feature, properties: { ...feature.properties, returned_flag: returned, submitted_at: latestSurvey?.created_at || null } };
  });
  const submitted = regridMatches.length + survey123Only;
  return { features: enriched, submitted, assigned: activeFeatures.length, open: Math.max(activeFeatures.length - submitted, 0) };
}

async function enrichWithParcelReference(features) {
  const missing = [...new Set(features
    .map((feature) => String(feature.properties?.parcel_number || feature.properties?.parcel_key || "").trim())
    .filter((parcel) => parcel && !state.parcelReference.has(parcel)))];
  for (let start = 0; start < missing.length; start += 80) {
    const batch = missing.slice(start, start + 80);
    const where = `parcel_number IN (${batch.map((parcel) => `'${parcel.replace(/'/g, "''")}'`).join(",")})`;
    const payload = await fetchArcgisJson(`${EPP_PARCEL_LAYER_URL}/query`, {
      f: "json",
      where,
      outFields: "parcel_number,par_mapblocklo,council_district",
      returnGeometry: "false"
    });
    (payload.features || []).forEach((record) => {
      const attrs = record.attributes || {};
      if (attrs.parcel_number) state.parcelReference.set(String(attrs.parcel_number), {
        block_lot: attrs.par_mapblocklo || "",
        council_district: attrs.council_district || ""
      });
    });
  }
  return features.map((feature) => {
    const props = feature.properties || {};
    const reference = state.parcelReference.get(String(props.parcel_number || props.parcel_key || "")) || {};
    return { ...feature, properties: { ...props, ...reference, block_lot: reference.block_lot || props.block_lot || "" } };
  });
}

async function refreshOverview() {
  if (!state.month || !state.organization) return setEmptyState("Choose an organization to view progress");
  titleNode.textContent = `${state.organization} completion progress`;
  freshnessNode.textContent = `Loading ${state.month} assignments...`;
  detailNode.textContent = "Loading assigned parcels and service evidence...";
  try {
    const assignments = await fetchAssignmentGeojsonForPeriod(state.month);
    const contractorFeatures = assignments.features.filter((feature) => (
      cleanOrganization(feature.properties.organization) === state.organization &&
      feature.properties.maintenance_level === "Active"
    ));
    const [surveyRows, survey123ByPeriod] = await Promise.all([
      fetchSurveyRecordsForPeriod(state.month).catch(() => []),
      loadSurvey123EvidenceByPeriod([state.month], contractorFeatures).catch(() => ({}))
    ]);
    const metrics = applyEvidence(contractorFeatures, surveyRows, survey123ByPeriod[state.month] || []);
    metrics.features = await enrichWithParcelReference(metrics.features).catch(() => metrics.features);
    state.features = metrics.features;
    state.selectedObjectId = "";
    assignedNode.textContent = formatNumber(metrics.assigned);
    submittedNode.textContent = formatNumber(metrics.submitted);
    openNode.textContent = formatNumber(metrics.open);
    const rate = metrics.assigned ? (100 * metrics.submitted) / metrics.assigned : 0;
    rateNode.hidden = false;
    rateValueNode.textContent = `${rate.toFixed(1)}%`;
    rateBarNode.style.width = `${Math.min(rate, 100)}%`;
    freshnessNode.textContent = `${state.month} · ${state.organization}`;
    detailNode.textContent = metrics.features.length
      ? "Select an open parcel to switch directly to service submission."
      : "No active parcels are assigned to this organization for the selected month.";
    renderOverview();
    const geometries = state.layer.graphics.filter((graphic) => !graphic.attributes?.label).map((graphic) => graphic.geometry);
    if (geometries.length) state.view.goTo(geometries, { duration: 450 }).catch(() => {});
  } catch (error) {
    setEmptyState("Progress data is unavailable");
    detailNode.textContent = `Unable to load contractor progress: ${error.message}`;
    freshnessNode.textContent = "Data unavailable";
  }
}

async function initializeMap() {
  state.layer = new GraphicsLayer();
  state.map = new Map({ basemap: "gray-vector", layers: [state.layer] });
  state.view = new MapView({
    container: mapNode,
    map: state.map,
    center: [-79.9959, 40.4406],
    zoom: 12,
    ui: { components: [] }
  });
  await state.view.when();
  state.view.ui.add(new Zoom({ view: state.view }), "bottom-right");
  state.view.ui.add(new BasemapToggle({ view: state.view, nextBasemap: "hybrid" }), "bottom-right");
  state.view.watch("scale", updateLabelVisibility);
  state.view.on("click", async (event) => {
    const hit = await state.view.hitTest(event).catch(() => null);
    const graphic = hit?.results.map((result) => result.graphic).find((item) => item?.attributes?.assignmentObjectId && !item.attributes?.label);
    if (!graphic) return;
    const feature = state.features.find((item) => String(item.properties.objectid) === String(graphic.attributes.assignmentObjectId));
    selectFeature(feature);
  });
  refreshOverview();
}

document.querySelectorAll("[data-contractor-status]").forEach((button) => button.addEventListener("click", () => {
  state.statusFilter = button.dataset.contractorStatus || "all";
  if (state.selectedObjectId && !visibleFeatures().some((feature) => String(feature.properties.objectid) === state.selectedObjectId)) {
    state.selectedObjectId = "";
  }
  renderOverview();
}));

document.querySelectorAll("[data-contractor-view]").forEach((button) => button.addEventListener("click", () => {
  setOverviewView(button.dataset.contractorView);
}));

document.querySelectorAll("[data-contractor-sort]").forEach((button) => button.addEventListener("click", () => {
  const key = button.dataset.contractorSort;
  state.listSort = {
    key,
    direction: state.listSort.key === key && state.listSort.direction === "asc" ? "desc" : "asc"
  };
  renderList();
}));

listNode?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-contractor-list-id]");
  if (!button) return;
  const feature = state.features.find((item) => String(item.properties.objectid) === button.dataset.contractorListId);
  if (!feature) return;
  if (feature.properties.returned_flag) {
    setOverviewView("map");
    selectFeature(feature);
  } else {
    selectFeature(feature, { openSubmit: true });
  }
});

document.querySelectorAll("[data-contractor-tab]").forEach((link) => link.addEventListener("click", (event) => {
  event.preventDefault();
  setTab(link.dataset.contractorTab);
}));

document.addEventListener("landcare:contractor-context", (event) => {
  const next = event.detail || {};
  const changed = state.month !== next.month || state.organization !== next.organization;
  state.month = next.month;
  state.organization = next.organization;
  syncUrlContext();
  if (changed) {
    refreshOverview();
  } else if (next.parcel) {
    const selected = state.features.find((feature) => String(feature.properties.objectid) === String(next.parcel));
    if (selected) selectFeature(selected);
  }
});

window.addEventListener("popstate", () => {
  const tab = new URLSearchParams(window.location.search).get("tab") || "overview";
  setTab(tab);
});

setTab(new URLSearchParams(window.location.search).get("tab") || "overview");
setOverviewView("map");
initializeMap().catch(() => { detailNode.textContent = "The progress map could not load. Use the submission tab to select an assigned parcel."; });
