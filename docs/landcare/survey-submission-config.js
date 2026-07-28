// Set this to the Survey123 share URL from the existing "LandCare Network" survey.
// Example: https://survey123.arcgis.com/share/0123456789abcdef0123456789abcdef
// Keep this file free of tokens, passwords, and private portal URLs.
export const SURVEY123_SHARE_URL =
  "https://survey123.arcgis.com/share/02a003254ba546c28b4997b42e0f220b";

// Public, query-only current-period assignment reference. This service is refreshed
// from the monthly Regrid assignment bundle and contains no edit capability.
export const ASSIGNMENT_CURRENT_LAYER_URL =
  "https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/gisdb_gis_regrid_bundle_assignments_current_period/FeatureServer/0";
export const ASSIGNMENT_HISTORY_LAYER_URL =
  "https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/gisdb_gis_regrid_bundle_assignments_history/FeatureServer/0";

// These names must match the Survey123 question names when the survey is built.
// Survey123 URL parameters then populate the selected assignment before the user
// completes the Regrid-equivalent checklist and attaches photo evidence.
export const SURVEY123_PREFILL_FIELDS = {
  organization: "organization",
  parcelNumber: "parcel_number",
  address: "address",
  assignmentPeriod: "assignment_period",
  // Survey123 retains the generated field name even though the hidden question
  // is labelled "assignment object ID" in the form designer.
  assignmentObjectId: "untitled_question_2",
  parcelLocation: "parcel_location"
};

// Public, query-only hosted polygon layer. It is materialized from validated
// Survey123 evidence and authoritative assignment geometry; never point the app
// at the raw Survey123 form/results layer.
export const SURVEY123_EVIDENCE_LAYER_URL =
  "https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/LandCare_Survey123_Evidence_Parcels/FeatureServer/0";
