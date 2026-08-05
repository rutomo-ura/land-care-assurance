import assert from "node:assert/strict";
import test from "node:test";

import { buildLiveAreaCompliance } from "../docs/landcare/area-compliance.js";

const finance = {
  contract_area_baselines: [
    { organization: "Amani Christian CDC", baseline_sqft: 1000 },
    { organization: "Chatman Properties", baseline_sqft: 2000 }
  ],
  contract_area_baseline_source: { refreshed_at: "2026-07-29" }
};

function feature(period, organization, parcel, squareFeet) {
  return { properties: { period_month: period, organization, parcel_digits: parcel, parcel_sqft: squareFeet } };
}

test("aggregates unique live assignment parcels and applies Power BI baselines", () => {
  const result = buildLiveAreaCompliance({ features: [
    feature("2026-07", "Amani Christian CDC", "A", 550),
    feature("2026-07", "Amani Christian CDC", "B", 500),
    feature("2026-07", "Amani Christian CDC", "B", 500),
    feature("2026-07", "Chatman Properties Primary Contact", "C", 2500),
    feature("2026-07", "Unassigned", "D", 100)
  ] }, finance);

  assert.equal(result.metadata.source_status, "available");
  assert.equal(result.rows.length, 2);
  const amani = result.rows.find((row) => row.organization === "Amani Christian CDC");
  assert.equal(amani.assigned_parcels, 2);
  assert.equal(amani.assigned_sqft, 1050);
  assert.equal(amani.lower_limit_sqft, 900);
  assert.equal(amani.upper_limit_sqft, 1100);
  assert.equal(amani.variance_pct, 5);
  assert.equal(amani.compliance_status, "within_tolerance");
  const chatman = result.rows.find((row) => row.organization === "Chatman Properties");
  assert.equal(chatman.compliance_status, "above_tolerance");
});

test("retains rows when a contractor baseline is unavailable", () => {
  const result = buildLiveAreaCompliance({ features: [feature("2026-07", "New Contractor", "X", 400)] }, finance);
  assert.equal(result.rows[0].baseline_sqft, null);
  assert.equal(result.rows[0].variance_pct, null);
  assert.equal(result.rows[0].compliance_status, "baseline_unavailable");
});

test("returns unavailable metadata for an empty assignment feed", () => {
  const result = buildLiveAreaCompliance({ features: [] }, finance);
  assert.equal(result.metadata.source_status, "unavailable");
  assert.deepEqual(result.rows, []);
});
