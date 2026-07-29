"""Authenticated Survey123 webhook: enqueue/reconcile one record and fast-publish its polygon."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request

app = FastAPI(title="LandCare Survey123 evidence webhook", docs_url=None, redoc_url=None)
SCRIPT = Path(__file__).with_name("survey123_evidence_sync.py")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/webhook/survey123")
async def survey123_webhook(request: Request, x_landcare_webhook_token: str | None = Header(default=None)) -> dict[str, str]:
    expected = os.getenv("LANDCARE_SURVEY_WEBHOOK_TOKEN", "")
    if not expected or x_landcare_webhook_token != expected:
        raise HTTPException(status_code=401, detail="Invalid webhook token")
    payload = await request.json()
    object_id = payload.get("objectId") or payload.get("objectid") or payload.get("featureId")
    if object_id is None:
        raise HTTPException(status_code=400, detail="Survey123 webhook must include objectId")
    completed = subprocess.run(
        [sys.executable, str(SCRIPT), "--object-id", str(object_id), "--publish-fast-path"],
        capture_output=True, text=True, timeout=120, check=False,
    )
    if completed.returncode:
        raise HTTPException(status_code=422, detail=completed.stderr[-1000:] or completed.stdout[-1000:])
    return {"status": "synced", "object_id": str(object_id)}
