import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../docs/kpi/index.html", import.meta.url), "utf8");
const script = await readFile(new URL("../docs/landcare/kpi.js", import.meta.url), "utf8");

test("consolidates repetitive finance tabs into Land Care Budget", () => {
  const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(tabs, ["landing", "quarterlyReporting", "areaDistribution", "powerBiBudget"]);
  assert.doesNotMatch(html, /data-panel="(?:budget|invoices|maintenanceExpenses)"/);
});

test("secure embed targets the Land Care Budget report page", () => {
  assert.match(html, /app\.powerbi\.com\/reportEmbed\?/);
  assert.match(html, /reportId=2d592a10-7083-470a-96aa-41fbdc59218c/);
  assert.match(html, /pageName=fe756b7016e6baa7351e/);
  assert.doesNotMatch(html, /pageName=8c93bab49c96aa8e3bd2/);
  assert.match(html, /autoAuth=true/);
  assert.doesNotMatch(html, /view\?r=/);
  assert.match(html, />Open in Power BI<\/a>/);
});

test("secure embed targets the Parcel Area Distribution report page", () => {
  assert.match(html, /id="powerBiParcelAreaFrame"/);
  assert.match(html, /pageName=4a5502453e9080b7a655/);
  assert.match(html, /groups\/me\/reports\/2d592a10-7083-470a-96aa-41fbdc59218c\/4a5502453e9080b7a655/);
  assert.doesNotMatch(html, /view\?r=/);
});

test("removes hidden context controls from layout", async () => {
  const css = await readFile(new URL("../docs/landcare/app.css", import.meta.url), "utf8");
  assert.match(css, /\.report-context \[hidden\] \{ display: none; \}/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(160px, 1fr\)\)/);
});

test("loads Power BI only when its tab is selected", () => {
  assert.match(html, /id="powerBiBudgetFrame"[\s\S]+data-src=/);
  assert.match(html, /id="powerBiParcelAreaFrame"[\s\S]+data-src=/);
  assert.match(script, /tab === "powerBiBudget"/);
  assert.match(script, /tab === "areaDistribution"/);
  assert.match(script, /!frame\.hasAttribute\("src"\)/);
  assert.match(script, /frame\.src = frame\.dataset\.src/);
});

test("native Parcel Area metrics do not substitute ArcGIS square footage", () => {
  assert.match(script, /buildPowerBiAreaCompliance\(financeSummary\)/);
  assert.doesNotMatch(script, /buildLiveAreaCompliance/);
  assert.match(script, /Power BI parcel-area aggregates are not available for the selected month/);
});

test("quarterly ownership table only exposes populated parcel fields", () => {
  const start = script.indexOf("function renderQuarterlyReporting");
  const end = script.indexOf("function renderAreaCompliance");
  const quarterlySection = script.slice(start, end);
  assert.match(quarterlySection, /label: "Parcel share"/);
  assert.doesNotMatch(quarterlySection, /label: "(?:Square feet|Expected responsibility|Billed|Paid|Outstanding)"/);
  assert.doesNotMatch(quarterlySection, /Unavailable/);
});

test("quarterly CSV omits unsupported ownership finance fields", () => {
  const start = script.indexOf('document.getElementById("exportQuarterCsvButton")');
  const exportSection = script.slice(start);
  assert.match(exportSection, /"Parcel share"/);
  assert.doesNotMatch(exportSection, /"(?:Square feet|Expected responsibility|Billed|Paid|Outstanding|Unavailable)"/);
});
