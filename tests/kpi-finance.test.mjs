import assert from "node:assert/strict";
import test from "node:test";

import {
  financeFeedState,
  semanticQuarterSummary,
  semanticYearSummary
} from "../docs/landcare/finance-semantic.js";

const finance = {
  actual_invoice_source: {
    status: "available",
    feed_status: "stale",
    source_system: "Power BI semantic model",
    refreshed_at: "2026-08-04T07:14:38Z"
  },
  semantic_summary: {
    annual: [{
      year: 2026,
      total_amount_spent: 458995.17,
      yearly_limit: 775000,
      percentage_spent: 59.23,
      quarters: [{ quarter: "2026-Q3", amount_spent: 78097.67 }]
    }]
  }
};

test("selects Power BI semantic year and quarter values", () => {
  assert.equal(semanticYearSummary(finance, 2026).total_amount_spent, 458995.17);
  assert.equal(semanticQuarterSummary(finance, "2026-Q3").amount_spent, 78097.67);
  assert.equal(semanticYearSummary(finance, 2025), null);
});

test("reports current availability separately from stale freshness", () => {
  assert.deepEqual(financeFeedState(finance), {
    available: true,
    stale: true,
    sourceLabel: "Power BI Land Care Budget model",
    refreshedAt: "2026-08-04T07:14:38Z"
  });
});

test("supports a legacy finance contract without semantic fields", () => {
  assert.equal(semanticYearSummary({ actual_invoice_source: { status: "available" } }, 2026), null);
  assert.equal(financeFeedState({ actual_invoice_source: { status: "available" } }).available, true);
});
