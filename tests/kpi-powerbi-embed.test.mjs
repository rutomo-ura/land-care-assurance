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
  assert.match(html, /pageName=8c93bab49c96aa8e3bd2/);
  assert.match(html, /autoAuth=true/);
  assert.doesNotMatch(html, /view\?r=/);
  assert.match(html, />Open in Power BI<\/a>/);
});

test("loads Power BI only when its tab is selected", () => {
  assert.match(html, /id="powerBiBudgetFrame"[\s\S]+data-src=/);
  assert.match(script, /tab === "powerBiBudget"/);
  assert.match(script, /!frame\.hasAttribute\("src"\)/);
  assert.match(script, /frame\.src = frame\.dataset\.src/);
});
