import Map from "https://js.arcgis.com/4.30/@arcgis/core/Map.js";
import MapView from "https://js.arcgis.com/4.30/@arcgis/core/views/MapView.js";
import GeoJSONLayer from "https://js.arcgis.com/4.30/@arcgis/core/layers/GeoJSONLayer.js";
import FeatureLayer from "https://js.arcgis.com/4.30/@arcgis/core/layers/FeatureLayer.js";
import Home from "https://js.arcgis.com/4.30/@arcgis/core/widgets/Home.js";
import Search from "https://js.arcgis.com/4.30/@arcgis/core/widgets/Search.js";
import BasemapToggle from "https://js.arcgis.com/4.30/@arcgis/core/widgets/BasemapToggle.js";
import Expand from "https://js.arcgis.com/4.30/@arcgis/core/widgets/Expand.js";
import Legend from "https://js.arcgis.com/4.30/@arcgis/core/widgets/Legend.js";

window.__landcareProposal = { booted: true, arcgisStarted: false, arcgisReady: false };

      const statusColors = {
        returned: "#0098d3",
        missing: "#f0c24b",
        request_only: "#c7d0d5",
        ownership_risk: "#c2410c"
      };

      const contractorPalette = [
        "#0098d3",
        "#006c9f",
        "#008f9f",
        "#554a8f",
        "#f0c24b",
        "#c2410c",
        "#5f7f95",
        "#2f4858",
        "#8a8f98",
        "#46a758"
      ];

      const scenarioData = {
        current: {
          cards: [
            ["Layer", "2026-04", "Latest survey month with returned submissions in the prototype export"],
            ["Mapped parcels", "1,076", "Real parcel polygons loaded from the PostGIS export"],
            ["No QA gate yet", "Current state", "Assignment export still needs pre-15th ownership and key checks"]
          ]
        },
        qa: {
          cards: [
            ["QA candidate", "Owner check", "Join assignment candidates to county, URA, PLB, and city ownership references"],
            ["Holdout logic", "Exception log", "Flag stale, transferred, duplicate, or unmatched parcels before survey handoff"],
            ["Dashboard impact", "Cleaner denominator", "Completion and compliance should show valid assignments separately"]
          ]
        },
        optimized: {
          cards: [
            ["Bundle input", "Real parcels", "Start from this latest-month mapped assignment layer"],
            ["Balance", "Count + area", "Optimize by contractor capacity, parcel count, acreage, and geography"],
            ["Survey package", "ArcGIS or CSV", "Emit the reviewed bundle to Regrid, Survey123, Field Maps, or a web form"]
          ]
        }
      };

      const layerModes = {
        overview: "status",
        monitoring: "status",
        bundle: "contractor",
        workflow: "status",
        roadmap: "status",
        deck: "status"
      };

      const mapState = {
        parcelLayer: null,
        view: null,
        colorMode: "status",
        summary: null
      };

      function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "\"": "&quot;",
          "'": "&#39;"
        }[char]));
      }

      function formatNumber(value) {
        return new Intl.NumberFormat("en-US").format(value);
      }

      function titleCaseStatus(value) {
        const labels = {
          returned: "Returned",
          missing: "Open / not returned",
          request_only: "Request Only",
          ownership_risk: "Ownership risk"
        };
        return labels[value] || value;
      }

      function statusItems(summary) {
        const counts = summary?.status_counts || {};
        return Object.entries(statusColors).map(([value, color]) => ({
          value,
          label: titleCaseStatus(value),
          color,
          count: counts[value] || 0
        })).filter((item) => item.count > 0 || item.value !== "ownership_risk");
      }

      function contractorItems(summary) {
        const counts = summary?.contractor_counts || {};
        return Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([value, count], index) => ({
            value,
            label: value.replace(" LLC & LawnCare", ""),
            color: contractorPalette[index % contractorPalette.length],
            count
          }));
      }

      function renderLegend(mode = mapState.colorMode) {
        const legend = document.getElementById("mapLegend");
        const items = mode === "contractor" ? contractorItems(mapState.summary) : statusItems(mapState.summary);
        legend.innerHTML = `
          <div class="legend-heading">${mode === "contractor" ? "Contractor" : "Survey Status"}</div>
          <div class="legend-items">
            ${items.map((item) => `
              <div class="legend-item">
                <span class="swatch" style="background:${item.color}"></span>
                <span class="legend-label">${escapeHtml(item.label)}</span>
                <span class="legend-count">${formatNumber(item.count)}</span>
              </div>
            `).join("")}
          </div>
        `;
      }

      function renderBarChart(containerId, data) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const maxValue = Math.max(...data.map((item) => item.value));
        container.innerHTML = data.map((item) => {
          const width = Math.max((item.value / maxValue) * 100, 4);
          return `
            <div class="chart-row">
              <div class="chart-label">${escapeHtml(item.label)}</div>
              <div class="chart-track"><span class="chart-bar" style="width:${width}%;background:${item.color}"></span></div>
              <div class="chart-value">${formatNumber(item.value)}</div>
            </div>
          `;
        }).join("");
      }

      function renderScenarioCards(scenarioName) {
        const scenario = scenarioData[scenarioName];
        const container = document.getElementById("scenarioCards");
        container.innerHTML = scenario.cards.map(([label, value, note], index) => `
          <article class="scenario-card ${index === 2 && scenarioName !== "optimized" ? "is-risk" : ""}">
            <span class="detail-label">${escapeHtml(label)}</span>
            <h2>${escapeHtml(value)}</h2>
            <p>${escapeHtml(note)}</p>
          </article>
        `).join("");
      }

      function activateModule(moduleName) {
        document.querySelectorAll("[data-module]").forEach((tab) => {
          tab.classList.toggle("is-active", tab.dataset.module === moduleName);
        });
        document.querySelectorAll("[data-panel]").forEach((panel) => {
          panel.classList.toggle("is-active", panel.dataset.panel === moduleName);
        });
        setColorMode(layerModes[moduleName] || "status");
      }

      function setScenario(scenarioName) {
        mapState.scenario = scenarioName;
        document.querySelectorAll("[data-scenario]").forEach((button) => {
          button.classList.toggle("is-active", button.dataset.scenario === scenarioName);
        });
        renderScenarioCards(scenarioName);
      }

      function setColorMode(mode) {
        mapState.colorMode = mode;
        document.querySelectorAll("[data-color-mode]").forEach((button) => {
          button.classList.toggle("is-active", button.dataset.colorMode === mode);
        });
        if (mapState.parcelLayer) {
          mapState.parcelLayer.renderer = mode === "contractor" ? contractorRenderer() : statusRenderer();
        }
        updateCallout();
        renderLegend(mode);
      }

      document.querySelectorAll("[data-module]").forEach((button) => {
        button.addEventListener("click", () => activateModule(button.dataset.module));
      });

      document.querySelectorAll("[data-scenario]").forEach((button) => {
        button.addEventListener("click", () => setScenario(button.dataset.scenario));
      });

      document.querySelectorAll("[data-color-mode]").forEach((button) => {
        button.addEventListener("click", () => setColorMode(button.dataset.colorMode));
      });

      try {
        renderScenarioCards("current");
      } catch (error) {
        console.error(error);
        document.getElementById("mapStatus").textContent = "Scenario cards did not initialize.";
      }

      function completionPct(summary) {
        const active = summary?.level_counts?.Active || 0;
        const returned = summary?.status_counts?.returned || 0;
        return active ? `${(returned * 100 / active).toFixed(1)}%` : "0.0%";
      }

      function updateSummary(summary) {
        mapState.summary = summary;
        document.getElementById("kpiAssigned").textContent = formatNumber(summary.feature_count || 0);
        document.getElementById("kpiReturned").textContent = formatNumber(summary.status_counts?.returned || 0);
        document.getElementById("kpiCompletion").textContent = completionPct(summary);
        document.getElementById("kpiMonth").textContent = summary.latest_month || "Latest";

        const statusData = statusItems(summary).map((item) => ({
          label: item.label,
          value: item.count,
          color: item.color
        }));
        const contractorData = contractorItems(summary).map((item) => ({
          label: item.label,
          value: item.count,
          color: item.color
        }));
        renderBarChart("funnelChart", statusData);
        renderBarChart("contractorChart", contractorData);
        renderLegend(mapState.colorMode);
      }

      function fillSymbol(color, outline = "#ffffff") {
        return {
          type: "simple-fill",
          color: `${color}b8`,
          outline: { color: outline, width: 0.65 }
        };
      }

      function statusRenderer() {
        return {
          type: "unique-value",
          field: "completion_status",
          defaultSymbol: fillSymbol("#8a8f98"),
          uniqueValueInfos: statusItems(mapState.summary).map((item) => ({
            value: item.value,
            label: item.label,
            symbol: fillSymbol(item.color)
          }))
        };
      }

      function contractorRenderer() {
        return {
          type: "unique-value",
          field: "organization",
          defaultSymbol: fillSymbol("#8a8f98"),
          uniqueValueInfos: contractorItems(mapState.summary).map((item) => ({
            value: item.value,
            label: item.label,
            symbol: fillSymbol(item.color)
          }))
        };
      }

      function updateCallout() {
        const callout = document.getElementById("mapCallout");
        const summary = mapState.summary;
        const month = summary?.latest_month || "latest month";
        const modeLabel = mapState.colorMode === "contractor" ? "contractor" : "survey status";
        callout.innerHTML = `
          <strong>Real ${month} LandCare parcels</strong>
          <span>Showing ${formatNumber(summary?.feature_count || 0)} mapped parcel polygons, colored by ${modeLabel}.</span>
        `;
      }

      async function startArcgisMap() {
        window.__landcareProposal.arcgisStarted = true;
        let summary = null;
        try {
          const response = await fetch("data/landcare_latest_month_summary.json");
          summary = await response.json();
          updateSummary(summary);
        } catch (error) {
          console.error(error);
          summary = { feature_count: 0, status_counts: {}, contractor_counts: {}, level_counts: {} };
          updateSummary(summary);
        }

        const parcelLayer = new GeoJSONLayer({
          url: "data/landcare_latest_month.geojson",
          title: "Latest Month LandCare Parcels",
          outFields: ["*"],
          renderer: statusRenderer(),
          opacity: 0.88,
          popupTemplate: {
            title: "{organization}",
            content: `
              <b>Parcel:</b> {parcel_key}<br>
              <b>Survey month:</b> {period_month}<br>
              <b>Status:</b> {completion_status}<br>
              <b>Maintenance level:</b> {maintenance_level}<br>
              <b>Ownership:</b> {ownership_type}
            `
          }
        });
        mapState.parcelLayer = parcelLayer;

        const neighborhoodLayer = new FeatureLayer({
          url: "https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/PGHWebNeighborhoods/FeatureServer/0",
          title: "City Neighborhoods",
          opacity: 0.2,
          renderer: {
            type: "simple",
            symbol: {
              type: "simple-fill",
              color: [0, 152, 211, 0.04],
              outline: { color: [0, 108, 159, 0.45], width: 0.7 }
            }
          },
          popupEnabled: false
        });

        const councilLayer = new FeatureLayer({
          url: "https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/CouncilDistricts2022/FeatureServer/0",
          title: "Council Districts",
          visible: true,
          renderer: {
            type: "simple",
            symbol: {
              type: "simple-fill",
              color: [240, 194, 75, 0.05],
              outline: { color: [158, 116, 17, 0.75], width: 1.2 }
            }
          },
          popupEnabled: false
        });

        const map = new Map({
          basemap: "topo-vector",
          layers: [neighborhoodLayer, councilLayer, parcelLayer]
        });

        const view = new MapView({
          container: "viewDiv",
          map,
          center: [-79.9959, 40.4406],
          zoom: 12,
          constraints: { minZoom: 10 },
          popup: {
            dockEnabled: true,
            dockOptions: { buttonEnabled: false, breakpoint: false, position: "bottom-left" }
          }
        });

        mapState.view = view;
        view.ui.add(new Home({ view }), "top-left");
        view.ui.add(new Search({ view, includeDefaultSources: true }), "top-right");
        view.ui.add(new BasemapToggle({ view, nextBasemap: "satellite" }), "bottom-right");
        view.ui.add(new Expand({
          view,
          content: new Legend({ view, layerInfos: [{ layer: neighborhoodLayer }, { layer: councilLayer }] }),
          expanded: false
        }), "top-left");

        view.when(() => {
          setColorMode("status");
          parcelLayer.when(() => {
            document.getElementById("mapStatus").textContent = `Loaded ${formatNumber(summary.feature_count || 0)} real LandCare parcel polygons for ${summary.latest_month}.`;
            window.__landcareProposal.arcgisReady = true;
            if (parcelLayer.fullExtent) {
              view.goTo(parcelLayer.fullExtent.expand(1.08), { duration: 650 }).catch(() => {});
            }
          });
        }).catch(() => {
          document.getElementById("mapStatus").textContent = "Map could not load. Check ArcGIS CDN/network access.";
        });
      }

      try {
        document.getElementById("mapStatus").textContent = "Starting ArcGIS map and loading latest-month parcel data...";
        startArcgisMap().catch((error) => {
          console.error(error);
          document.getElementById("mapStatus").textContent = "ArcGIS map did not initialize. Check SDK/network access.";
        });
      } catch (error) {
        console.error(error);
        document.getElementById("mapStatus").textContent = "Proposal app did not initialize.";
      }

      window.updateMapGraphics = window.updateMapGraphics || function noop() {};
