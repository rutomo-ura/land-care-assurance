"""Reconcile Survey123 submissions into authoritative LandCare parcel evidence.

This is safe to run from the daily scheduler and may also be called for one
webhook object. It never publishes Survey123 point geometry.
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

import psycopg2

DEFAULT_SURVEY123_EVIDENCE_LAYER_URL = (
    "https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/"
    "LandCare_Network_Internal_Survey_3_view/FeatureServer/0"
)
PORTAL_URL = "https://urap.maps.arcgis.com"


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def database_dsn() -> str:
    """Use the existing Regrid VM PostgreSQL variables when no DSN is supplied."""
    configured = os.getenv("LANDCARE_PG_DSN", "").strip()
    if configured:
        return configured
    database = os.getenv("PG_DB", "").strip()
    user = os.getenv("PG_USER", "").strip()
    password = os.getenv("PG_PWD", "")
    if not database or not user or not password:
        raise RuntimeError("Set LANDCARE_PG_DSN or the existing Regrid PG_DB, PG_USER, and PG_PWD variables.")
    host = os.getenv("PG_HOST", "localhost").strip() or "localhost"
    port = os.getenv("PG_PORT", "5432").strip() or "5432"
    return f"postgresql://{quote(user, safe='')}:{quote(password, safe='')}@{host}:{port}/{quote(database, safe='')}"


def first(attributes: dict[str, Any], *names: str) -> Any:
    lowered = {str(k).lower(): v for k, v in attributes.items()}
    for name in names:
        value = lowered.get(name.lower())
        if value not in (None, ""):
            return value
    return None


def iso_timestamp(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat()
    return str(value)


def iso_date(value: Any) -> str | None:
    """Normalize Survey123 date-only values, including ArcGIS epoch milliseconds."""
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc).date().isoformat()
    return str(value).split("T", 1)[0]


def request_json(url: str, params: dict[str, Any]) -> dict[str, Any]:
    token = os.getenv("SURVEY123_ARCGIS_TOKEN", "").strip()
    if token and "token" not in params:
        params["token"] = token
    with urlopen(f"{url}?{urlencode(params)}", timeout=60) as response:
        payload = json.load(response)
    if payload.get("error"):
        raise RuntimeError(payload["error"])
    return payload


def post_json(url: str, values: dict[str, Any]) -> dict[str, Any]:
    encoded = urlencode(values).encode("utf-8")
    request = Request(url, data=encoded, method="POST")
    with urlopen(request, timeout=60) as response:
        payload = json.load(response)
    if payload.get("error"):
        raise RuntimeError(payload["error"])
    return payload


def arcgis_edit_token() -> str:
    configured = os.getenv("LANDCARE_SURVEY_EVIDENCE_ARCGIS_TOKEN", "").strip()
    if configured:
        return configured
    username = os.getenv("AGO_USER", "").strip()
    password = os.getenv("AGO_PWD", "")
    if not username or not password:
        raise RuntimeError("Set LANDCARE_SURVEY_EVIDENCE_ARCGIS_TOKEN or the existing Regrid AGO_USER and AGO_PWD values.")
    payload = post_json(f"{PORTAL_URL}/sharing/rest/generateToken", {
        "f": "json", "username": username, "password": password,
        "client": "referer", "referer": PORTAL_URL, "expiration": "60",
    })
    token = str(payload.get("token") or "")
    if not token:
        raise RuntimeError("ArcGIS token generation returned no token.")
    return token


def image_attachment(layer_url: str, object_id: int | str) -> tuple[str | None, str | None]:
    payload = request_json(f"{layer_url}/{object_id}/attachments", {"f": "json"})
    item = next((x for x in payload.get("attachmentInfos", []) if str(x.get("contentType", "")).startswith("image/")), None)
    if not item:
        return None, None
    public_layer = os.getenv("SURVEY123_PUBLIC_ATTACHMENT_LAYER_URL", "").strip().rstrip("/") or layer_url
    return f"{public_layer}/{object_id}/attachments/{item['id']}", item.get("name")


def records(layer_url: str, only_object_id: str | None) -> list[dict[str, Any]]:
    where = f"OBJECTID = {int(only_object_id)}" if only_object_id else "1=1"
    params = {"f": "json", "where": where, "outFields": "*", "returnGeometry": "false", "resultRecordCount": 1000}
    offset = 0
    result: list[dict[str, Any]] = []
    while True:
        payload = request_json(f"{layer_url}/query", {**params, "resultOffset": offset})
        batch = payload.get("features", [])
        result.extend(batch)
        if len(batch) < 1000 or only_object_id:
            return result
        offset += len(batch)


def upsert_raw(connection: Any, attributes: dict[str, Any], image_url: str | None, image_name: str | None) -> None:
    global_id = first(attributes, "globalid", "global_id")
    if not global_id:
        raise ValueError("Survey123 record has no GlobalID")
    object_id = first(attributes, "objectid", "object_id")
    values = {
        "source_global_id": str(global_id), "source_object_id": object_id,
        "assignment_object_id": first(attributes, "assignment_object_id", "untitled_question_2"),
        "parcel_number": first(attributes, "parcel_number", "parcelnumb", "parcel_id"),
        "organization": first(attributes, "organization", "maintained_by", "contractor"),
        "assignment_period": first(attributes, "assignment_period", "period_label", "period"),
        "service_date": iso_date(first(attributes, "service_date", "date_of_services", "date_services")),
        "additional_notes": first(attributes, "additional_notes", "additional_note", "notes", "note"),
        "submitted_at": iso_timestamp(first(attributes, "creationdate", "created_at")),
        "image_attachment_url": image_url, "image_attachment_name": image_name,
        "source_payload": json.dumps(attributes),
        "source_updated_at": iso_timestamp(first(attributes, "editdate", "last_edited_date", "creationdate")),
    }
    sql = """
      INSERT INTO gis.landcare_survey123_evidence_raw
      (source_global_id, source_object_id, assignment_object_id, parcel_number, organization, assignment_period, service_date, additional_notes, submitted_at, image_attachment_url, image_attachment_name, source_payload, source_updated_at, processing_error)
      VALUES (%(source_global_id)s, %(source_object_id)s, %(assignment_object_id)s, %(parcel_number)s, %(organization)s, %(assignment_period)s, %(service_date)s, %(additional_notes)s, %(submitted_at)s, %(image_attachment_url)s, %(image_attachment_name)s, %(source_payload)s::jsonb, %(source_updated_at)s, NULL)
      ON CONFLICT (source_global_id) DO UPDATE SET
        source_object_id = EXCLUDED.source_object_id, assignment_object_id = EXCLUDED.assignment_object_id,
        parcel_number = EXCLUDED.parcel_number, organization = EXCLUDED.organization,
        assignment_period = EXCLUDED.assignment_period, service_date = EXCLUDED.service_date, additional_notes = EXCLUDED.additional_notes,
        submitted_at = EXCLUDED.submitted_at, image_attachment_url = EXCLUDED.image_attachment_url,
        image_attachment_name = EXCLUDED.image_attachment_name, source_payload = EXCLUDED.source_payload,
        source_updated_at = EXCLUDED.source_updated_at, processing_error = NULL, updated_at = now()
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, values)


def publish_fast_path(connection: Any, source_object_id: str) -> None:
    """Upsert one validated polygon without waiting for the daily ArcPy snapshot."""
    layer_url = required("LANDCARE_SURVEY_EVIDENCE_LAYER_URL").rstrip("/")
    token = arcgis_edit_token()
    with connection.cursor() as cursor:
        cursor.execute("""
          SELECT source_global_id, assignment_id, parcel_key, parcel_number, organization,
                 service_period, service_date, additional_notes, submitted_at, evidence_source, image_attachment_url,
                 image_attachment_name, validated_at, ST_AsGeoJSON(geometry)
          FROM gis.landcare_survey_evidence_parcels p
          JOIN gis.landcare_survey123_evidence_raw r USING (source_global_id)
          WHERE r.source_object_id = %s
        """, (source_object_id,))
        row = cursor.fetchone()
        fields = [column.name for column in cursor.description] if row else []
    if not row:
        return
    item = dict(zip(fields, row))
    geometry = json.loads(item.pop("st_asgeojson"))
    attributes = {key: (value.isoformat() if hasattr(value, "isoformat") else value) for key, value in item.items()}
    source_global_id = str(attributes["source_global_id"]).replace("'", "''")
    existing = request_json(f"{layer_url}/query", {
        "f": "json", "where": f"source_global_id = '{source_global_id}'",
        "outFields": "OBJECTID", "returnGeometry": "false", "token": token,
    }).get("features", [])
    payload = {"f": "json", "token": token}
    feature = {"attributes": attributes, "geometry": {"rings": geometry["coordinates"]}}
    if existing:
        feature["attributes"]["OBJECTID"] = existing[0]["attributes"]["OBJECTID"]
        payload["updates"] = json.dumps([feature])
    else:
        payload["adds"] = json.dumps([feature])
    response = post_json(f"{layer_url}/applyEdits", payload)
    result = response.get("updateResults") or response.get("addResults") or []
    if not result or not result[0].get("success"):
        raise RuntimeError(f"ArcGIS fast-path applyEdits failed: {response}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--object-id", help="Reconcile one webhook submission immediately")
    parser.add_argument("--publish-fast-path", action="store_true", help="Upsert the validated polygon to the stable hosted layer")
    args = parser.parse_args()
    layer_url = (os.getenv("SURVEY123_FEATURE_LAYER_URL", "").strip() or DEFAULT_SURVEY123_EVIDENCE_LAYER_URL).rstrip("/")
    dsn = database_dsn()
    source_records = records(layer_url, args.object_id)
    with psycopg2.connect(dsn) as connection:
        for feature in source_records:
            attributes = feature.get("attributes", {})
            object_id = first(attributes, "objectid", "object_id")
            try:
                image_url, image_name = image_attachment(layer_url, object_id)
                upsert_raw(connection, attributes, image_url, image_name)
                connection.commit()
            except Exception as error:
                # Keep a durable record for the next reconciliation instead of
                # losing a submission whose attachment is not ready yet.
                connection.rollback()
                global_id = first(attributes, "globalid", "global_id")
                if global_id:
                    with connection.cursor() as cursor:
                        cursor.execute("""INSERT INTO gis.landcare_survey123_evidence_raw (source_global_id, source_object_id, source_payload, processing_error)
                          VALUES (%s, %s, %s::jsonb, %s)
                          ON CONFLICT (source_global_id) DO UPDATE SET processing_error = EXCLUDED.processing_error, updated_at = now()""",
                          (str(global_id), object_id, json.dumps(attributes), str(error)))
                    connection.commit()
                print(f"Submission {object_id} deferred: {error}")
        with connection.cursor() as cursor:
            cursor.execute("SELECT valid_count, invalid_count FROM gis.refresh_landcare_survey_evidence_parcels()")
            valid_count, invalid_count = cursor.fetchone()
            cursor.execute("""SELECT validation_status, count(*)
                              FROM gis.landcare_survey123_evidence_qa
                              WHERE validation_status <> 'valid'
                              GROUP BY validation_status ORDER BY validation_status""")
            invalid_by_reason = dict(cursor.fetchall())
            cursor.execute("""SELECT count(*) FROM gis.landcare_survey123_evidence_raw
                              WHERE processing_error IS NOT NULL OR processed_at IS NULL""")
            backlog = cursor.fetchone()[0]
        connection.commit()
        if args.publish_fast_path and args.object_id:
            publish_fast_path(connection, args.object_id)
    print(json.dumps({
        "source_records": len(source_records), "valid_evidence": valid_count,
        "invalid_evidence": invalid_count, "invalid_by_reason": invalid_by_reason,
        "apply_edits_backlog": backlog,
    }))


if __name__ == "__main__":
    main()
