"""Survey123 webhook receiver for approved LandCare survey evidence.

The public Survey123 form writes to ArcGIS. This service receives Survey123
webhooks, reads the authoritative submission from ArcGIS, and upserts only
approved records into PostgreSQL. Configure it on the VM; never put its secrets
in the GitHub Pages site.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import psycopg2
from fastapi import FastAPI, Header, HTTPException, Request as FastApiRequest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

LOG = logging.getLogger("landcare.survey_webhook")
app = FastAPI(title="LandCare Survey123 evidence webhook", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://rutomo-ura.github.io"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def env(name: str, *, required: bool = True) -> str:
    value = os.getenv(name, "").strip()
    if required and not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def bool_answer(value: Any) -> bool | None:
    if value is None or value == "":
        return None
    normalized = str(value).strip().lower()
    if normalized in {"yes", "true", "1"}:
        return True
    if normalized in {"no", "false", "0"}:
        return False
    return None


def first_value(attributes: dict[str, Any], *keys: str) -> Any:
    lowered = {str(key).lower(): value for key, value in attributes.items()}
    for key in keys:
        value = lowered.get(key.lower())
        if value not in (None, ""):
            return value
    return None


def to_iso(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value) / 1000, tz=timezone.utc).isoformat()
    return str(value)


def normalise_submission(feature: dict[str, Any], attachment_url: str | None) -> dict[str, Any]:
    attributes = feature.get("attributes", feature)
    if not isinstance(attributes, dict):
        raise ValueError("Survey123 feature attributes are missing")
    global_id = first_value(attributes, "globalid", "global_id", "submission_global_id")
    if not global_id:
        raise ValueError("Survey123 submission has no GlobalID")
    approval_status = str(first_value(attributes, "review_status", "approval_status") or "pending").lower()
    return {
        "source_global_id": str(global_id),
        "source_object_id": first_value(attributes, "objectid", "object_id"),
        "approval_status": approval_status,
        "parcel_number": first_value(attributes, "parcelnumb", "parcel_number", "parcel_id"),
        "address": first_value(attributes, "address", "service_address"),
        "maintained_by": first_value(attributes, "maintained_by", "contractor", "organization"),
        "service_date": first_value(attributes, "date_of_services", "service_date", "date_services"),
        "submitted_at": to_iso(first_value(attributes, "creationdate", "created_at", "submitted_at")),
        "first_visit": bool_answer(first_value(attributes, "first_visit")),
        "litter_dumping": bool_answer(first_value(attributes, "litter_dumping", "litter_removal")),
        "grass_cutting": bool_answer(first_value(attributes, "grass_cutting", "vegetation_service")),
        "pruning_clipping": bool_answer(first_value(attributes, "pruning_clipping", "pruning")),
        "vehicles_lot": bool_answer(first_value(attributes, "vehicles_lot", "vehicles")),
        "additional_comments": first_value(attributes, "additional_comments", "comments", "notes"),
        "latitude": first_value(attributes, "latitude", "lat"),
        "longitude": first_value(attributes, "longitude", "lon"),
        "image_attachment_url": attachment_url,
        "image_attachment_name": None,
        "reviewed_by": first_value(attributes, "reviewed_by", "reviewer_name"),
        "reviewed_at": to_iso(first_value(attributes, "reviewed_at", "review_date")),
        "review_reason": first_value(attributes, "review_reason", "rejection_reason"),
        "source_payload": attributes,
    }


def fetch_arcgis_feature(object_id: str | int) -> dict[str, Any]:
    layer_url = env("SURVEY123_FEATURE_LAYER_URL").rstrip("/")
    params = {"f": "json", "objectIds": str(object_id), "outFields": "*", "returnGeometry": "true"}
    token = env("SURVEY123_ARCGIS_TOKEN", required=False)
    if token:
        params["token"] = token
    with urlopen(f"{layer_url}/query?{urlencode(params)}", timeout=30) as response:
        payload = json.load(response)
    if payload.get("error") or not payload.get("features"):
        raise ValueError(f"Unable to read Survey123 object {object_id}: {payload.get('error', {})}")
    feature = payload["features"][0]
    geometry = feature.get("geometry") or {}
    feature.setdefault("attributes", {}).setdefault("longitude", geometry.get("x"))
    feature.setdefault("attributes", {}).setdefault("latitude", geometry.get("y"))
    return feature


def fetch_arcgis_attachment_url(object_id: str | int) -> tuple[str | None, str | None]:
    """Return the first image attachment through the configured public layer URL.

    The query may use a private service token, but the stored URL never includes
    that token. The public map therefore needs a public read-only attachment view.
    """
    source_layer = env("SURVEY123_FEATURE_LAYER_URL").rstrip("/")
    params = {"f": "json"}
    token = env("SURVEY123_ARCGIS_TOKEN", required=False)
    if token:
        params["token"] = token
    with urlopen(f"{source_layer}/{object_id}/attachments?{urlencode(params)}", timeout=30) as response:
        payload = json.load(response)
    attachment = next(
        (item for item in payload.get("attachmentInfos", []) if str(item.get("contentType", "")).startswith("image/")),
        None,
    )
    if not attachment:
        return None, None
    public_layer = env("SURVEY123_PUBLIC_ATTACHMENT_LAYER_URL", required=False).rstrip("/") or source_layer
    return f"{public_layer}/{object_id}/attachments/{attachment['id']}", attachment.get("name")


def upsert_approved_submission(record: dict[str, Any]) -> bool:
    if record["approval_status"] != "approved":
        return False
    if not record["parcel_number"] or not record["maintained_by"]:
        raise ValueError("Approved Survey123 submission requires parcel number and contractor")
    dsn = env("LANDCARE_PG_DSN")
    columns = list(record.keys())
    values = [json.dumps(value) if key == "source_payload" else value for key, value in record.items()]
    updates = ", ".join(f"{column} = EXCLUDED.{column}" for column in columns if column != "source_global_id")
    sql = f"""
      INSERT INTO gis.ura_landcare_survey_submissions_internal ({', '.join(columns)})
      VALUES ({', '.join(['%s'] * len(columns))})
      ON CONFLICT (source_global_id) DO UPDATE SET {updates}
    """
    with psycopg2.connect(dsn) as connection, connection.cursor() as cursor:
        cursor.execute(sql, values)
    return True


def event_key(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def claim_event(payload: dict[str, Any]) -> tuple[bool, str]:
    dsn = env("LANDCARE_PG_DSN")
    key = event_key(payload)
    with psycopg2.connect(dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            """INSERT INTO gis.ura_landcare_survey_webhook_events (event_key, payload)
               VALUES (%s, %s)
               ON CONFLICT (event_key) DO UPDATE SET payload = EXCLUDED.payload, processing_error = NULL
               WHERE gis.ura_landcare_survey_webhook_events.processed_at IS NULL""",
            (key, json.dumps(payload)),
        )
        return cursor.rowcount == 1, key


def mark_event(key: str, error: str | None = None) -> None:
    dsn = env("LANDCARE_PG_DSN")
    with psycopg2.connect(dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "UPDATE gis.ura_landcare_survey_webhook_events SET processed_at = CASE WHEN %s IS NULL THEN now() ELSE NULL END, processing_error = %s WHERE event_key = %s",
            (error, error, key),
        )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/public/approved-evidence")
def approved_evidence() -> JSONResponse:
    """Public GeoJSON feed: approved records only, for the GitHub Pages Monitor."""
    dsn = env("LANDCARE_PG_DSN")
    sql = """
      SELECT source_global_id, parcelnumb, address, maintained_by, service_date,
             submitted_at, image_url, reviewed_at, lat, lon
      FROM gis.landcare_approved_survey_evidence
      WHERE image_url IS NOT NULL
      ORDER BY submitted_at DESC NULLS LAST
      LIMIT 10000
    """
    with psycopg2.connect(dsn) as connection, connection.cursor() as cursor:
        cursor.execute(sql)
        fields = [column.name for column in cursor.description]
        rows = [dict(zip(fields, row)) for row in cursor.fetchall()]
    features = []
    for row in rows:
        longitude, latitude = row.pop("lon"), row.pop("lat")
        features.append({
            "type": "Feature",
            "id": str(row.pop("source_global_id")),
            # A selected parcel can supply the geometry in Map Monitor, so do
            # not hide approved photo evidence merely because a survey lacks a
            # device location. GeoJSON permits a null geometry.
            "geometry": (
                {"type": "Point", "coordinates": [float(longitude), float(latitude)]}
                if longitude is not None and latitude is not None
                else None
            ),
            "properties": {key: value.isoformat() if hasattr(value, "isoformat") else value for key, value in row.items()},
        })
    return JSONResponse(
        {"type": "FeatureCollection", "features": features},
        headers={"Cache-Control": "public, max-age=60"},
    )


@app.post("/webhook/survey123")
async def survey123_webhook(request: FastApiRequest, x_landcare_webhook_token: str | None = Header(default=None)) -> dict[str, Any]:
    expected_token = env("LANDCARE_SURVEY_WEBHOOK_TOKEN")
    if x_landcare_webhook_token != expected_token:
        raise HTTPException(status_code=401, detail="Invalid webhook token")
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="JSON object payload required")
    claimed, key = claim_event(payload)
    if not claimed:
        return {"status": "duplicate"}
    try:
        feature = payload.get("feature")
        object_id = payload.get("objectId") or payload.get("objectid") or payload.get("featureId")
        if not isinstance(feature, dict):
            if object_id is None:
                raise ValueError("Feature or objectId required")
            feature = fetch_arcgis_feature(object_id)
        object_id = object_id or first_value(feature.get("attributes", {}), "objectid", "object_id")
        attachment_url, attachment_name = fetch_arcgis_attachment_url(object_id) if object_id is not None else (None, None)
        record = normalise_submission(feature, attachment_url=attachment_url)
        record["image_attachment_name"] = attachment_name
        synced = upsert_approved_submission(record)
        mark_event(key)
        return {"status": "synced" if synced else "pending", "source_global_id": record["source_global_id"]}
    except Exception as error:
        mark_event(key, str(error))
        LOG.exception("Survey123 webhook processing failed")
        raise HTTPException(status_code=422, detail="Survey submission could not be processed") from error
