const DATA_ROOT = "../landcare/data";

const formatter = new Intl.NumberFormat("en-US");
const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

function formatNumber(value) {
  return formatter.format(Number(value || 0));
}

function formatPct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function shortMonth(month) {
  const [year, rawMonth] = String(month).split("-");
  const date = new Date(Number(year), Number(rawMonth) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function shortContractor(name) {
  return String(name || "Unassigned")
    .replace("FHCV Contracting LLC & LawnCare", "FHCV Contracting")
    .replace("Ervin Home Beautification", "Ervin Home")
    .replace("Operation Better Block", "Op. Better Block")
    .replace("One Call Handles It All", "One Call");
}

function rateColor(rate) {
  if (rate >= 80) return "#2e7d32";
  if (rate >= 50) return "#0098d3";
  if (rate >= 10) return "#e65100";
  return "#b71c1c";
}

function latestMetric(monthlyMetrics, latestMonth) {
  return monthlyMetrics.find((row) => row.period_month === latestMonth) || monthlyMetrics.at(-1);
}

function priorMetric(monthlyMetrics, latestMonth) {
  const index = monthlyMetrics.findIndex((row) => row.period_month === latestMonth);
  return index > 0 ? monthlyMetrics[index - 1] : null;
}

function renderKpis(summary, monthlyMetrics, latestSummary) {
  const latest = latestMetric(monthlyMetrics, summary.latest_month);
  const prior = priorMetric(monthlyMetrics, summary.latest_month);
  const activeAssigned = summary.level_counts?.Active || latest?.assigned_active || 0;
  const returned = summary.status_counts?.returned || latest?.returned_assigned || 0;
  const open = summary.status_counts?.missing || 0;
  const completion = activeAssigned ? (100 * returned) / activeAssigned : 0;
  const priorRate = Number(prior?.active_completion_rate_pct || 0);
  const delta = completion - priorRate;
  const comparison = latestSummary.powerbi_comparison || {};

  document.getElementById("freshnessNote").textContent =
    `${latestSummary.source_note} Generated ${latestSummary.generated_on}.`;
  document.getElementById("activeAssignedKpi").textContent = formatNumber(activeAssigned);
  document.getElementById("activeAssignedNote").textContent = `${summary.latest_month} active denominator`;
  document.getElementById("returnedKpi").textContent = formatNumber(returned);
  document.getElementById("completionKpi").textContent = formatPct(completion);
  document.getElementById("completionDelta").textContent =
    prior ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts vs ${prior.period_month}` : "No prior month";
  document.getElementById("openKpi").textContent = formatNumber(open);
  document.getElementById("mappedKpi").textContent = formatNumber(summary.feature_count);
  document.getElementById("spendKpi").textContent = moneyFormatter.format(comparison.total_amount_spent || 0);
  document.getElementById("spendNote").textContent =
    `${Math.round((100 * (comparison.total_amount_spent || 0)) / (comparison.projected_yearly_limit || 1))}% of ${moneyFormatter.format(comparison.projected_yearly_limit || 0)} limit`;
}

function renderContractorOptions(rows, latestMonth) {
  const select = document.getElementById("contractorSelect");
  const names = [...new Set(rows.filter((row) => row.period_month === latestMonth).map((row) => row.organization))].sort();
  select.innerHTML = [
    '<option value="all">All contractors</option>',
    ...names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(shortContractor(name))}</option>`)
  ].join("");
}

function renderContractorBars(rows, latestMonth, selected = "all") {
  const latestRows = rows
    .filter((row) => row.period_month === latestMonth)
    .filter((row) => selected === "all" || row.organization === selected)
    .sort((a, b) => b.completion_rate_pct - a.completion_rate_pct);

  document.getElementById("contractorBars").innerHTML = latestRows.map((row) => {
    const color = rateColor(row.completion_rate_pct);
    const width = Math.max(row.completion_rate_pct, row.returned_assigned_parcel_keys ? 2 : 0);
    return `
      <div class="bar-row">
        <div class="bar-meta">
          <strong>${escapeHtml(shortContractor(row.organization))}</strong>
          <span style="color:${color}">${formatPct(row.completion_rate_pct)}</span>
        </div>
        <div class="track"><span class="fill" style="width:${Math.min(width, 100)}%;background:${color}"></span></div>
        <div class="bar-note">${formatNumber(row.returned_assigned_parcel_keys)} of ${formatNumber(row.assigned_parcel_keys)} returned</div>
      </div>
    `;
  }).join("");
}

function renderTimeline(monthlyMetrics) {
  const maxRate = Math.max(...monthlyMetrics.map((row) => Number(row.active_completion_rate_pct || 0)), 100);
  document.getElementById("timelineBars").innerHTML = monthlyMetrics.map((row) => {
    const rate = Number(row.active_completion_rate_pct || 0);
    const color = rateColor(rate);
    return `
      <div class="bar-row">
        <strong>${shortMonth(row.period_month)}</strong>
        <div class="track"><span class="fill" style="width:${Math.max((rate / maxRate) * 100, 1)}%;background:${color}"></span></div>
        <span style="color:${color};font-weight:800">${formatPct(rate)}</span>
      </div>
    `;
  }).join("");
}

function renderReconciliation(latestSummary) {
  const comparison = latestSummary.powerbi_comparison || {};
  const cards = [
    ["Power BI assigned", comparison.dashboard_assigned_count],
    ["SQL mapped assigned", comparison.sql_export_assigned_count],
    ["Power BI returned", comparison.dashboard_returned_count],
    ["SQL returned", comparison.sql_export_returned_count],
    ["Assigned difference", comparison.assigned_difference],
    ["Returned difference", comparison.returned_difference]
  ];
  document.getElementById("reconcileGrid").innerHTML = cards.map(([label, value]) => `
    <div class="reconcile-card">
      <span>${escapeHtml(label)}</span>
      <strong>${formatNumber(value)}</strong>
    </div>
  `).join("");
}

function renderSource(summary, latestSummary) {
  document.getElementById("sourceText").textContent =
    `${latestSummary.source_note} Source tables include gis.regrid_bundle_assignments, gis.regrid_survey_submissions, gis.pgh_parcels, gis.epp_parcels_full, gis.epp_snapshot, analysis.city_epp_properties, and analysis.assessment_snapshot. The latest map layer is ${summary.latest_month}; assignment freshness is ${latestSummary.latest_assignment_period}; survey completion freshness is ${latestSummary.latest_survey_period}.`;
}

async function loadData() {
  const [summary, monthlyMetrics, contractorRows, latestSummary] = await Promise.all([
    fetch(`${DATA_ROOT}/latest_month_summary.json`).then((response) => response.json()),
    fetch(`${DATA_ROOT}/monthly_metrics.json`).then((response) => response.json()),
    fetch(`${DATA_ROOT}/contractor_monthly.json`).then((response) => response.json()),
    fetch(`${DATA_ROOT}/kpi_summary.json`).then((response) => response.json())
  ]);
  return { summary, monthlyMetrics, contractorRows, latestSummary };
}

async function main() {
  const { summary, monthlyMetrics, contractorRows, latestSummary } = await loadData();
  renderKpis(summary, monthlyMetrics, latestSummary);
  renderContractorOptions(contractorRows, summary.latest_month);
  renderContractorBars(contractorRows, summary.latest_month);
  renderTimeline(monthlyMetrics);
  renderReconciliation(latestSummary);
  renderSource(summary, latestSummary);

  document.getElementById("contractorSelect").addEventListener("change", (event) => {
    renderContractorBars(contractorRows, summary.latest_month, event.target.value);
  });
}

main().catch((error) => {
  console.error(error);
  document.getElementById("freshnessNote").textContent = "KPI dashboard failed to load source data.";
});
