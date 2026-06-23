"""Build the current LandCare parcel universe from public ArcGIS Online layers."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "docs" / "landcare" / "data"

EPP_LAYER = (
    "https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/"
    "gisdb_gis_epp_parcels_full/FeatureServer/0"
)
SURVEY_LAYER = (
    "https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/"
    "gisdb_gis_regrid_surveys/FeatureServer/0"
)

OUT_FIELDS = [
    "OBJECTID",
    "parcel_number",
    "property_id",
    "inventory_type",
    "current_status",
    "neighborhood",
    "project_name",
    "property_class",
    "property_maint_mgr_name",
    "tags",
    "mod_dt",
    "parcel_sqft",
]


def fetch_json(url: str, params: dict[str, object] | None = None) -> dict:
    query = urlencode(params or {})
    full_url = f"{url}?{query}" if query else url
    with urlopen(full_url, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def iso_from_millis(value: int | float | None) -> str | None:
    if value in (None, ""):
        return None
    return datetime.fromtimestamp(float(value) / 1000, tz=UTC).date().isoformat()


def strip_primary_contact(value: str | None) -> str:
    name = (value or "Unassigned").strip()
    return name.removesuffix(" Primary Contact").strip() or "Unassigned"


def maintenance_level(tags: str | None) -> str:
    text = tags or ""
    if "LandCare - Request Only" in text:
        return "Request Only"
    if "LandCare - Active" in text:
        return "Active"
    return "LandCare"


def completion_status(level: str) -> str:
    return "request_only" if level == "Request Only" else "current_active"


def arcgis_polygon_to_geojson(geometry: dict | None) -> dict | None:
    rings = (geometry or {}).get("rings")
    if not rings:
        return None
    return {"type": "Polygon", "coordinates": rings}


def query_epp_features() -> list[dict]:
    where = "tags LIKE '%LandCare%' AND inventory_type = 'URA Owned'"
    result = fetch_json(
        f"{EPP_LAYER}/query",
        {
            "f": "json",
            "where": where,
            "outFields": ",".join(OUT_FIELDS),
            "returnGeometry": "true",
            "outSR": "4326",
            "resultRecordCount": 2000,
            "orderByFields": "property_maint_mgr_name ASC, parcel_number ASC",
        },
    )
    if "error" in result:
        raise SystemExit(result["error"])
    features = result.get("features") or []
    if result.get("exceededTransferLimit"):
        raise SystemExit("ArcGIS query exceeded transfer limit; pagination is required.")
    return features


def count_current_epp_records() -> int:
    result = fetch_json(
        f"{EPP_LAYER}/query",
        {
            "f": "json",
            "where": "tags LIKE '%LandCare%' AND inventory_type = 'URA Owned'",
            "returnCountOnly": "true",
        },
    )
    if "error" in result:
        raise SystemExit(result["error"])
    return int(result.get("count") or 0)


def layer_summary(url: str, date_field: str) -> dict:
    meta = fetch_json(url, {"f": "json"})
    stats = [
        {"statisticType": "count", "onStatisticField": "OBJECTID", "outStatisticFieldName": "record_count"},
        {"statisticType": "min", "onStatisticField": date_field, "outStatisticFieldName": f"min_{date_field}"},
        {"statisticType": "max", "onStatisticField": date_field, "outStatisticFieldName": f"max_{date_field}"},
    ]
    result = fetch_json(
        f"{url}/query",
        {"f": "json", "where": "1=1", "outStatistics": json.dumps(stats)},
    )
    attributes = ((result.get("features") or [{}])[0]).get("attributes", {})
    editing = meta.get("editingInfo") or {}
    return {
        "record_count": attributes.get("record_count"),
        "min_date": iso_from_millis(attributes.get(f"min_{date_field}")),
        "max_date": iso_from_millis(attributes.get(f"max_{date_field}")),
        "data_last_edit": iso_from_millis(editing.get("dataLastEditDate")),
        "service_url": url.rsplit("/", 1)[0],
    }


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def build_current_data(output_dir: Path) -> None:
    source_features = query_epp_features()
    source_query_count = count_current_epp_records()
    features = []
    for source in source_features:
        attrs = source.get("attributes") or {}
        geometry = arcgis_polygon_to_geojson(source.get("geometry"))
        if not geometry:
            continue
        level = maintenance_level(attrs.get("tags"))
        contractor = strip_primary_contact(attrs.get("property_maint_mgr_name"))
        parcel_key = attrs.get("parcel_number") or attrs.get("property_id") or f"EPP-{attrs.get('OBJECTID')}"
        features.append(
            {
                "type": "Feature",
                "geometry": geometry,
                "properties": {
                    "objectid": attrs.get("OBJECTID"),
                    "parcel_key": parcel_key,
                    "parcel_number": parcel_key,
                    "property_id": attrs.get("property_id"),
                    "period_month": "Current",
                    "organization": contractor,
                    "organization_contact": attrs.get("property_maint_mgr_name"),
                    "maintenance_level": level,
                    "completion_status": completion_status(level),
                    "returned_flag": False,
                    "ownership_type": "URA",
                    "inventory_type": attrs.get("inventory_type"),
                    "current_status": attrs.get("current_status"),
                    "neighborhood": attrs.get("neighborhood"),
                    "project_name": attrs.get("project_name"),
                    "property_class": attrs.get("property_class"),
                    "parcel_sqft": attrs.get("parcel_sqft"),
                    "tags": attrs.get("tags"),
                    "mod_dt": iso_from_millis(attrs.get("mod_dt")),
                    "source_layer": "gisdb_gis_epp_parcels_full",
                },
            }
        )

    if not features:
        raise SystemExit("No current URA-owned LandCare features returned from ArcGIS.")

    generated_on = datetime.now(UTC).date().isoformat()
    level_counts = Counter(feature["properties"]["maintenance_level"] for feature in features)
    status_counts = Counter(feature["properties"]["completion_status"] for feature in features)
    contractor_counts = Counter(feature["properties"]["organization"] for feature in features)
    neighborhoods = Counter(feature["properties"].get("neighborhood") or "Unknown" for feature in features)
    unique_parcel_keys = {feature["properties"]["parcel_key"] for feature in features}
    unique_level_counts = Counter()
    seen_by_level: dict[str, set[str]] = {}
    for feature in features:
        level = feature["properties"]["maintenance_level"]
        seen_by_level.setdefault(level, set()).add(feature["properties"]["parcel_key"])
    for level, keys in seen_by_level.items():
        unique_level_counts[level] = len(keys)
    epp_summary = layer_summary(EPP_LAYER, "mod_dt")
    survey_summary = layer_summary(SURVEY_LAYER, "created_at")

    summary = {
        "generated_on": generated_on,
        "view": "current_arcgis_universe",
        "source_note": (
            "Current ArcGIS Online EPP parcel layer filtered to inventory_type = URA Owned and LandCare tags. "
            "Survey-completion metrics still come from the monthly assurance export until a derived hosted layer is built."
        ),
        "source_layer": "gisdb_gis_epp_parcels_full",
        "source_layer_url": EPP_LAYER.rsplit("/", 1)[0],
        "survey_layer": "gisdb_gis_regrid_surveys",
        "survey_layer_url": SURVEY_LAYER.rsplit("/", 1)[0],
        "ownership_scope": "URA owned only",
        "feature_count": len(features),
        "unique_parcel_count": len(unique_parcel_keys),
        "duplicate_parcel_key_count": len(features) - len(unique_parcel_keys),
        "source_query_count": source_query_count,
        "missing_geometry_count": max(source_query_count - len(features), 0),
        "active_count": level_counts.get("Active", 0),
        "request_only_count": level_counts.get("Request Only", 0),
        "unique_active_count": unique_level_counts.get("Active", 0),
        "unique_request_only_count": unique_level_counts.get("Request Only", 0),
        "contractor_count": len(contractor_counts),
        "level_counts": dict(sorted(level_counts.items())),
        "status_counts": dict(sorted(status_counts.items())),
        "contractor_counts": dict(contractor_counts.most_common()),
        "neighborhood_counts": dict(neighborhoods.most_common(12)),
        "epp_layer": epp_summary,
        "survey_layer_summary": survey_summary,
    }

    write_json(
        output_dir / "current_universe.geojson",
        {
            "type": "FeatureCollection",
            "metadata": summary,
            "features": features,
        },
    )
    write_json(output_dir / "current_universe_summary.json", summary)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build current LandCare universe data from ArcGIS Online.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    build_current_data(args.output_dir)
    print(f"Wrote current ArcGIS LandCare data to {args.output_dir}")


if __name__ == "__main__":
    main()
