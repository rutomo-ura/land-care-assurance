"""Survey123 webhook receiver for canonical LandCare parcel evidence.

The public Survey123 form writes to ArcGIS. This service receives Survey123
webhooks, reads the authoritative submission and its selected assignment polygon
from ArcGIS, then upserts only a fully matched photo submission.  The Survey123
point remains evidence storage; the public evidence feed always returns the
authoritative assignment polygon. Configure it on the VM; never put its secrets
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


def parcel_digits(value: Any) -> str:
    return "".join(character for character in str(value or "") if character.isdigit())


def clean_organization(value: Any) -> str:
    return " ".join(str(value or "").replace("Primary Contact", "").split()).casefold()


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
        "source_survey_id": first_value(attributes, "survey_id") or env("SURVEY123_SURVEY_ID", required=False) or "survey123",
        "approval_status": approval_status,
        "parcel_number": first_value(attributes, "parcelnumb", "parcel_number", "parcel_id"),
        "address": first_value(attributes, "address", "service_address"),
        "maintained_by": first_value(attributes, "maintained_by", "contractor", "organization"),
        "assignment_period": first_value(attributes, "assignment_period", "period_label", "period"),
        # The existing Survey123 designer generated this field name. Keep that
        # implementation detail at the source boundary.
        "assignment_object_id": first_value(attributes, "assignment_object_id", "untitled_question_2"),
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


def fetch_assignment_feature(assignment_object_id: str | int) -> dict[str, Any]:
    """Read the authoritative polygon selected in the Submission page."""
    layer_url = env("LANDCARE_ASSIGNMENT_HISTORY_LAYER_URL").rstrip("/")
    params = {
        "f": "json",
        "objectIds": str(assignment_object_id),
        "outFields": "OBJECTID,parcelnumb,period_label,maintained_by,address",
        "returnGeometry": "true",
    }
    with urlopen(f"{layer_url}/query?{urlencode(params)}", timeout=30) as response:
        payload = json.load(response)
    if payload.get("error") or not payload.get("features"):
        raise ValueError(f"Unable to read assignment {assignment_object_id}: {payload.get('error', {})}")
    assignment = payload["features"][0]
    if not assignment.get("geometry", {}).get("rings"):
        raise ValueError("Authoritative assignment has no parcel polygon")
    return assignment


def assignment_matches_submission(record: dict[str, Any], assignment: dict[str, Any]) -> bool:
    attrs = assignment.get("attributes", {})
    return bool(
        record.get("image_attachment_url")
        and record.get("assignment_object_id")
        and parcel_digits(record.get("parcel_number")) == parcel_digits(first_value(attrs, "parcelnumb", "parcel_number"))
        and str(record.get("assignment_period") or "") == str(first_value(attrs, "period_label", "period") or "")
        and clean_organization(record.get("maintained_by")) == clean_organization(first_value(attrs, "maintained_by", "organization"))
    )


def attach_canonical_assignment(record: dict[str, Any], assignment: dict[str, Any]) -> dict[str, Any]:
    if not assignment_matches_submission(record, assignment):
        raise ValueError("Survey123 evidence does not match the selected authoritative assignment")
    attrs = assignment.get("attributes", {})
    return {
        **record,
        # "approved" is retained only for backward-compatible database/view
        # schemas. It means canonical validation passed; no reviewer gate.
        "approval_status": "approved",
        "assignment_object_id": first_value(attrs, "objectid", "OBJECTID"),
        "assignment_period": first_value(attrs, "period_label", "period"),
        "assignment_geometry": assignment["geometry"],
    }


def upsert_canonical_submission(record: dict[str, Any]) -> bool:
    if not record["parcel_number"] or not record["maintained_by"]:
        raise ValueError("Approved Survey123 submission requires parcel number and contractor")
    dsn = env("LANDCARE_PG_DSN")
    columns = list(record.keys())
    values = [json.dumps(value) if key in {"source_payload", "assignment_geometry"} else value for key, value in record.items()]
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


@app.get("/public/evidence-parcels")
def evidence_parcels() -> JSONResponse:
    """Public canonical polygon feed for ArcGIS and Map Monitor.

    Never return the Survey123 point geometry here.  A record reaches this feed
    only after its photo, parcel, period, contractor, and assignment ID match.
    """
    dsn = env("LANDCARE_PG_DSN")
    sql = """
      SELECT source_global_id, parcel_number, address, maintained_by,
             assignment_period, assignment_object_id, submitted_at,
             image_attachment_url, assignment_geometry
      FROM gis.landcare_survey_evidence_parcels
      ORDER BY submitted_at DESC NULLS LAST
      LIMIT 10000
    """
    with psycopg2.connect(dsn) as connection, connection.cursor() as cursor:
        cursor.execute(sql)
        fields = [column.name for column in cursor.description]
        rows = [dict(zip(fields, row)) for row in cursor.fetchall()]
    features = []
    for row in rows:
        geometry = row.pop("assignment_geometry")
        if isinstance(geometry, str):
            geometry = json.loads(geometry)
        features.append({
            "type": "Feature",
            "id": str(row.pop("source_global_id")),
            "geometry": {"type": "Polygon", "coordinates": geometry["rings"]},
            "properties": {
                key: value.isoformat() if hasattr(value, "isoformat") else value
                for key, value in row.items()
            },
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
        if not attachment_url:
            raise ValueError("Survey123 submission needs at least one image attachment")
        if not record.get("assignment_object_id"):
            raise ValueError("Survey123 submission is missing assignment_object_id")
        assignment = fetch_assignment_feature(record["assignment_object_id"])
        record = attach_canonical_assignment(record, assignment)
        synced = upsert_canonical_submission(record)
        mark_event(key)
        return {"status": "synced" if synced else "invalid", "source_global_id": record["source_global_id"]}
    except Exception as error:
        mark_event(key, str(error))
        LOG.exception("Survey123 webhook processing failed")
        raise HTTPException(status_code=422, detail="Survey submission could not be processed") from error
