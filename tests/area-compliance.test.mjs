import assert from "node:assert/strict";
import test from "node:test";

import { buildPowerBiAreaCompliance } from "../docs/landcare/area-compliance.js";

const finance = {
  semantic_area_summary: {
    status: "available",
    feed_status: "current",
    source_system: "Power BI semantic model",
    dataset_refreshed_at: "2026-08-05T07:00:00Z",
    rows: [
      { period_month: "2026-07", organization: "Amani Christian CDC", assigned_sqft: 1050, baseline_sqft: 1000 },
      { period_month: "2026-07", organization: "Chatman Properties", assigned_sqft: 2500, baseline_sqft: 2000 }
    ]
  }
};

test("builds compliance only from Power BI semantic aggregates", () => {
  const result = buildPowerBiAreaCompliance(finance);
  assert.equal(result.metadata.source_status, "available");
  assert.equal(result.metadata.source_system, "Power BI semantic model");
  assert.equal(result.rows.length, 2);
  const amani = result.rows.find((row) => row.organization === "Amani Christian CDC");
  assert.equal(amani.assigned_sqft, 1050);
  assert.equal(amani.lower_limit_sqft, 900);
  assert.equal(amani.upper_limit_sqft, 1100);
  assert.equal(amani.variance_pct, 5);
  assert.equal(amani.compliance_status, "within_tolerance");
  assert.equal(result.rows.find((row) => row.organization === "Chatman Properties").compliance_status, "above_tolerance");
});

test("rejects a non-Power-BI source instead of substituting values", () => {
  const result = buildPowerBiAreaCompliance({
    semantic_area_summary: { status: "available", source_system: "ArcGIS", rows: finance.semantic_area_summary.rows }
  });
  assert.equal(result.metadata.source_status, "unavailable");
  assert.deepEqual(result.rows, []);
});

test("preserves stale Power BI aggregates with visible freshness metadata", () => {
  const result = buildPowerBiAreaCompliance({
    semantic_area_summary: { ...finance.semantic_area_summary, feed_status: "stale" }
  });
  assert.equal(result.metadata.feed_status, "stale");
  assert.equal(result.rows.length, 2);
});

test("returns unavailable when no semantic parcel-area contract exists", () => {
  const result = buildPowerBiAreaCompliance({});
  assert.equal(result.metadata.source_status, "unavailable");
  assert.deepEqual(result.rows, []);
});
