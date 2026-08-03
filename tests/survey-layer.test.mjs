import assert from "node:assert/strict";
import test from "node:test";

const surveyLayer = await import("../docs/landcare/survey-layer.js");

test("uses the replacement Regrid service and normalizes additional_comments", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  globalThis.fetch = async (url) => {
    requestUrl = String(url);
    return {
      ok: true,
      json: async () => ({
        features: [{
          attributes: {
            OBJECTID: 12820,
            parcelnumb: "0046G00041000000",
            period_label: "2026-07",
            image_url: "https://example.test/evidence.jpg",
            additional_comments: "Gated and locked"
          }
        }]
      })
    };
  };
  try {
    const records = await surveyLayer.fetchSurveyEvidenceForParcel("0046-G-00041-0000-00", "2026-07");
    const url = new URL(requestUrl);
    assert.equal(surveyLayer.SURVEY_AGOL_ITEM_ID, "7a2e1d9bacba461296c54a63f104cf51");
    assert.equal(url.origin + url.pathname, "https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/regrid_surveys/FeatureServer/0/query");
    assert.equal(url.searchParams.get("where"), "parcelnumb = '0046G00041000000' AND period_label = '2026-07'");
    assert.equal(records[0].additional_notes, "Gated and locked");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("retains legacy note aliases when loading a period", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      features: [
        { attributes: { parcelnumb: "A", additional_notes: "Canonical note" } },
        { attributes: { parcelnumb: "B", additional_note: "Singular legacy note" } },
        { attributes: { parcelnumb: "C", notes: "Generic legacy note" } }
      ]
    })
  });
  try {
    const records = await surveyLayer.fetchSurveyRecordsForPeriod("2026-07");
    assert.deepEqual(records.map((record) => record.additional_notes), [
      "Canonical note",
      "Singular legacy note",
      "Generic legacy note"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports raw matched survey records separately from unique parcels", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => ({
      features: String(url).includes("regrid_surveys")
        ? [
            { attributes: { parcelnumb: "A", period_label: "2026-07" } },
            { attributes: { parcelnumb: "A", period_label: "2026-07" } },
            { attributes: { parcelnumb: "B", period_label: "2026-07" } }
          ]
        : []
    })
  });
  try {
    const result = await surveyLayer.loadCombinedEvidenceByPeriodWithStats(
      ["2026-07"],
      [{ properties: { period_month: "2026-07", parcel_key: "A" } }]
    );
    assert.deepEqual(result.surveyRecordStatsByPeriod["2026-07"], {
      period_month: "2026-07",
      raw_count: 3,
      matched_count: 2,
      matched_parcel_count: 1,
      matched_by_contractor: { Unassigned: 2 }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
