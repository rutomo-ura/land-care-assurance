"""Publish canonical Survey123 evidence polygons without requiring ArcGIS Pro.

The daily Regrid data job runs on a server account, where an ArcGIS Pro named-user
license is not initialized.  This publisher deliberately uses the ArcGIS REST API
instead of ``arcpy``: it creates one stable hosted Feature Service on bootstrap and
then reconciles its records by ``source_global_id`` on every run.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import traceback
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import psycopg2

from survey123_evidence_sync import PORTAL_URL, arcgis_edit_token, database_dsn


LAYER_TITLE = "LandCare Survey123 Evidence Parcels"
PORTAL_FOLDER = "LandCare - Published Layers"
AGOL_ITEM_ID = os.getenv("LANDCARE_SURVEY_EVIDENCE_AGOL_ITEM_ID", "").strip()


def log(message: str) -> None:
    print(f"[{dt.datetime.now():%Y-%m-%d %H:%M:%S}] {message}")


def post_json(url: str, values: dict[str, Any]) -> dict[str, Any]:
    encoded = urlencode(values).encode("utf-8")
    with urlopen(Request(url, data=encoded, method="POST"), timeout=120) as response:
        payload = json.load(response)
    if payload.get("error"):
        raise RuntimeError(f"ArcGIS REST error at {url}: {payload['error']}")
    return payload


def get_json(url: str, values: dict[str, Any]) -> dict[str, Any]:
    with urlopen(f"{url}?{urlencode(values)}", timeout=120) as response:
        payload = json.load(response)
    if payload.get("error"):
        raise RuntimeError(f"ArcGIS REST error at {url}: {payload['error']}")
    return payload


def portal_self(token: str) -> dict[str, Any]:
    return get_json(f"{PORTAL_URL}/sharing/rest/community/self", {"f": "json", "token": token})


def find_or_create_folder(username: str, token: str) -> str:
    content = get_json(f"{PORTAL_URL}/sharing/rest/content/users/{username}", {"f": "json", "token": token})
    existing = next((folder for folder in content.get("folders", []) if folder.get("title") == PORTAL_FOLDER), None)
    if existing:
        return str(existing["id"])
    folder = post_json(f"{PORTAL_URL}/sharing/rest/content/users/{username}/createFolder", {
        "f": "json", "token": token, "title": PORTAL_FOLDER,
    })
    folder_id = folder.get("folder", {}).get("id")
    if not folder_id:
        raise RuntimeError(f"ArcGIS did not create portal folder {PORTAL_FOLDER!r}: {folder}")
    return str(folder_id)


def item_details(item_id: str, token: str) -> dict[str, Any]:
    return get_json(f"{PORTAL_URL}/sharing/rest/content/items/{item_id}", {"f": "json", "token": token})


def admin_service_url(service_url: str) -> str:
    return service_url.replace("/rest/services/", "/rest/admin/services/")


def ensure_layer_fields(layer_url: str, token: str) -> None:
    """Add contract fields to an existing stable hosted layer without changing its item ID."""
    existing = get_json(layer_url, {"f": "json", "token": token})
    existing_names = {str(field.get("name")) for field in existing.get("fields", [])}
    required_fields = [field for field in layer_definition()["fields"] if field["name"] != "OBJECTID"]
    missing = [field for field in required_fields if field["name"] not in existing_names]
    if not missing:
        return
    post_json(f"{admin_service_url(layer_url)}/addToDefinition", {
        "f": "json", "token": token, "addToDefinition": json.dumps({"fields": missing}),
    })
    log("Added evidence fields: " + ", ".join(field["name"] for field in missing))


def layer_definition() -> dict[str, Any]:
    fields = [
        {"name": "OBJECTID", "type": "esriFieldTypeOID", "alias": "OBJECTID", "nullable": False},
        {"name": "source_global_id", "type": "esriFieldTypeString", "alias": "Survey123 global ID", "length": 80, "nullable": False},
        {"name": "assignment_id", "type": "esriFieldTypeInteger", "alias": "Assignment ID", "nullable": False},
        {"name": "parcel_key", "type": "esriFieldTypeString", "alias": "Parcel key", "length": 40, "nullable": False},
        {"name": "parcel_number", "type": "esriFieldTypeString", "alias": "Parcel number", "length": 80, "nullable": False},
        {"name": "organization", "type": "esriFieldTypeString", "alias": "Contractor", "length": 255, "nullable": False},
        {"name": "service_period", "type": "esriFieldTypeString", "alias": "Service period", "length": 16, "nullable": False},
        {"name": "service_date", "type": "esriFieldTypeDate", "alias": "Service date", "nullable": True},
        {"name": "additional_notes", "type": "esriFieldTypeString", "alias": "Additional Notes", "length": 4000, "nullable": True},
        {"name": "submitted_at", "type": "esriFieldTypeDate", "alias": "Submitted at", "nullable": True},
        {"name": "evidence_source", "type": "esriFieldTypeString", "alias": "Evidence source", "length": 32, "nullable": False},
        {"name": "image_attachment_url", "type": "esriFieldTypeString", "alias": "Photo URL", "length": 2048, "nullable": True},
        {"name": "image_attachment_name", "type": "esriFieldTypeString", "alias": "Photo filename", "length": 255, "nullable": True},
        {"name": "validated_at", "type": "esriFieldTypeDate", "alias": "Validated at", "nullable": False},
    ]
    return {
        "id": 0,
        "name": LAYER_TITLE,
        "type": "Feature Layer",
        "geometryType": "esriGeometryPolygon",
        "objectIdField": "OBJECTID",
        "displayField": "parcel_number",
        "globalIdField": "",
        "extent": {"xmin": -80.11, "ymin": 40.36, "xmax": -79.84, "ymax": 40.52, "spatialReference": {"wkid": 4326}},
        "spatialReference": {"wkid": 4326},
        "fields": fields,
        "drawingInfo": {"renderer": {"type": "simple", "symbol": {"type": "esriSFS", "style": "esriSFSSolid", "color": [0, 152, 211, 72], "outline": {"type": "esriSLS", "style": "esriSLSSolid", "color": [0, 82, 122, 255], "width": 1.5}}}},
        "capabilities": "Query",
        "allowGeometryUpdates": False,
    }


def bootstrap_service(username: str, token: str) -> tuple[str, str]:
    folder_id = find_or_create_folder(username, token)
    safe_name = re.sub(r"[^A-Za-z0-9_]", "_", LAYER_TITLE)
    create_parameters = {
        "name": safe_name,
        "serviceDescription": "Validated Survey123 evidence rendered as authoritative LandCare parcel polygons.",
        "hasStaticData": False,
        "maxRecordCount": 2000,
        "supportedQueryFormats": "JSON,geoJSON",
        "capabilities": "Query",
        "description": "Validated Survey123 evidence rendered as authoritative LandCare parcel polygons.",
        "spatialReference": {"wkid": 4326},
        "initialExtent": {"xmin": -80.11, "ymin": 40.36, "xmax": -79.84, "ymax": 40.52, "spatialReference": {"wkid": 4326}},
        "allowGeometryUpdates": True,
    }
    result = post_json(f"{PORTAL_URL}/sharing/rest/content/users/{username}/createService", {
        "f": "json", "token": token, "outputType": "featureService", "folderId": folder_id,
        "createParameters": json.dumps(create_parameters),
    })
    item_id, service_url = result.get("itemId"), result.get("serviceurl") or result.get("serviceUrl")
    if not item_id or not service_url:
        raise RuntimeError(f"ArcGIS did not create a hosted Feature Service: {result}")
    post_json(f"{admin_service_url(service_url)}/addToDefinition", {
        "f": "json", "token": token, "addToDefinition": json.dumps({"layers": [layer_definition()]}),
    })
    post_json(f"{PORTAL_URL}/sharing/rest/content/items/{item_id}/update", {
        "f": "json", "token": token, "title": LAYER_TITLE,
        "snippet": "Validated Survey123 evidence as authoritative LandCare parcel polygons.",
        "tags": "URA,LandCare,Survey123,evidence,parcels",
    })
    post_json(f"{PORTAL_URL}/sharing/rest/content/items/{item_id}/share", {"f": "json", "token": token, "everyone": "true", "org": "false"})
    log(f"Created stable hosted evidence layer {item_id}.")
    return str(item_id), str(service_url)


def snapshot_rows() -> list[dict[str, Any]]:
    with psycopg2.connect(database_dsn()) as connection, connection.cursor() as cursor:
        cursor.execute("""
          SELECT source_global_id, assignment_id, parcel_key, parcel_number, organization,
                 service_period, service_date, additional_notes, submitted_at, evidence_source, image_attachment_url,
                 image_attachment_name, validated_at, ST_AsGeoJSON(geometry) AS geometry
          FROM gis.landcare_survey_evidence_parcels
          ORDER BY source_global_id
        """)
        columns = [column.name for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


def epoch_millis(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        return int(value.timestamp() * 1000)
    return int(dt.datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp() * 1000)


def esri_feature(row: dict[str, Any], object_id: int | None = None) -> dict[str, Any]:
    geojson = json.loads(row.pop("geometry"))
    coordinates = geojson["coordinates"]
    rings = [ring for polygon in coordinates for ring in polygon] if geojson["type"] == "MultiPolygon" else coordinates
    attributes = {key: value for key, value in row.items() if key != "geometry"}
    attributes["submitted_at"] = epoch_millis(attributes.get("submitted_at"))
    attributes["service_date"] = epoch_millis(attributes.get("service_date"))
    attributes["validated_at"] = epoch_millis(attributes.get("validated_at"))
    if object_id is not None:
        attributes["OBJECTID"] = object_id
    return {"attributes": attributes, "geometry": {"rings": rings, "spatialReference": {"wkid": 4326}}}


def remote_rows(layer_url: str, token: str) -> dict[str, int]:
    rows: dict[str, int] = {}
    offset = 0
    while True:
        page = get_json(f"{layer_url}/query", {
            "f": "json", "token": token, "where": "1=1", "outFields": "OBJECTID,source_global_id",
            "returnGeometry": "false", "resultOffset": offset, "resultRecordCount": 2000,
        }).get("features", [])
        for feature in page:
            attrs = feature.get("attributes", {})
            if attrs.get("source_global_id") is not None:
                rows[str(attrs["source_global_id"])] = int(attrs["OBJECTID"])
        if len(page) < 2000:
            return rows
        offset += len(page)


def apply_edits(layer_url: str, token: str, key: str, features: list[dict[str, Any]]) -> None:
    for index in range(0, len(features), 100):
        result = post_json(f"{layer_url}/applyEdits", {"f": "json", "token": token, key: json.dumps(features[index:index + 100])})
        outcomes = result.get("addResults") if key == "adds" else result.get("updateResults")
        if not outcomes or any(not outcome.get("success") for outcome in outcomes):
            raise RuntimeError(f"Hosted layer {key} failed: {result}")


def reconcile_service(layer_url: str, token: str, rows: list[dict[str, Any]]) -> None:
    remote = remote_rows(layer_url, token)
    source_keys = {str(row["source_global_id"]) for row in rows}
    adds, updates = [], []
    for row in rows:
        key = str(row["source_global_id"])
        feature = esri_feature(dict(row), remote.get(key))
        (updates if key in remote else adds).append(feature)
    apply_edits(layer_url, token, "adds", adds)
    apply_edits(layer_url, token, "updates", updates)
    stale_ids = [object_id for key, object_id in remote.items() if key not in source_keys]
    for index in range(0, len(stale_ids), 200):
        deleted = post_json(f"{layer_url}/deleteFeatures", {
            "f": "json", "token": token, "objectIds": ",".join(str(value) for value in stale_ids[index:index + 200]),
        }).get("deleteResults", [])
        if len(deleted) != len(stale_ids[index:index + 200]) or any(not item.get("success") for item in deleted):
            raise RuntimeError(f"Hosted layer deletion failed: {deleted}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bootstrap", action="store_true", help="Create the stable hosted layer once when no item ID exists")
    args = parser.parse_args()
    rows = snapshot_rows()
    if not rows:
        raise RuntimeError("Evidence snapshot is empty; refusing to create or clear the stable hosted layer.")
    token = arcgis_edit_token()
    item_id = AGOL_ITEM_ID
    if item_id:
        item = item_details(item_id, token)
        service_url = str(item.get("url") or "")
        if not service_url:
            raise RuntimeError(f"Expected hosted evidence item {item_id} was not found or has no service URL.")
    else:
        if not args.bootstrap:
            raise RuntimeError("LANDCARE_SURVEY_EVIDENCE_AGOL_ITEM_ID is required; use --bootstrap only for the first publish.")
        user = portal_self(token).get("username")
        if not user:
            raise RuntimeError("Unable to identify the ArcGIS publisher account.")
        item_id, service_url = bootstrap_service(str(user), token)
    layer_url = f"{service_url.rstrip('/')}/0"
    ensure_layer_fields(layer_url, token)
    reconcile_service(layer_url, token, rows)
    count = len(remote_rows(layer_url, token))
    if count != len(rows):
        raise RuntimeError(f"Hosted evidence reconciliation count mismatch: expected {len(rows)}, got {count}.")
    log(f"Published {count:,} canonical evidence polygons to {item_id}.")
    print(f"LANDCARE_SURVEY_EVIDENCE_AGOL_ITEM_ID={item_id}")
    print(f"LANDCARE_SURVEY_EVIDENCE_LAYER_URL={layer_url}")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        raise
