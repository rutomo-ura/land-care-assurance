"""Overwrite the stable AGOL LandCare Survey123 Evidence Parcels item from PostGIS."""
from __future__ import annotations

import os
import datetime
import traceback

import arcpy
from arcgis.gis import GIS

SDE_CONN = r"C:\srv\connections\PostgreSQL-localhost-gisdb(gis_user).sde"
VIEW = "gis.landcare_survey_evidence_parcels"
OID_FIELD = "id"
FGDB = r"C:\srv\ArcGISProjects\Automated Web Layer Publishing\Automated Web Layer Publishing.gdb"
FC_NAME = "landcare_survey123_evidence_parcels"
FC_PATH = os.path.join(FGDB, FC_NAME)
APRX_PATH = r"C:\srv\ArcGISProjects\Automated Web Layer Publishing\Automated Web Layer Publishing.aprx"
MAP_NAME = "LandCareSurveyEvidencePublishMap"
STAGING_DIR = r"C:\srv\agol_publish_staging"
SDDRAFT = os.path.join(STAGING_DIR, "landcare_survey_evidence_parcels.sddraft")
SD_FILE = os.path.join(STAGING_DIR, "landcare_survey_evidence_parcels.sd")
AGOL_ITEM_ID = os.getenv("LANDCARE_SURVEY_EVIDENCE_AGOL_ITEM_ID", "").strip()
LAYER_TITLE = "LandCare Survey123 Evidence Parcels"
PORTAL_FOLDER = "LandCare - Published Layers"


def log(message: str) -> None:
    print(f"[{datetime.datetime.now():%Y-%m-%d %H:%M:%S}] {message}")


def main() -> None:
    if not AGOL_ITEM_ID:
        raise RuntimeError("LANDCARE_SURVEY_EVIDENCE_AGOL_ITEM_ID is required; refusing to create a new item.")
    arcpy.env.overwriteOutput = True
    os.makedirs(STAGING_DIR, exist_ok=True)
    for path in (SDDRAFT, SD_FILE):
        if os.path.exists(path): os.remove(path)
    query = arcpy.management.MakeQueryLayer(SDE_CONN, "landcare_evidence_query", f"SELECT * FROM {VIEW}", OID_FIELD, "POLYGON", "4326").getOutput(0)
    if arcpy.Exists(FC_PATH):
        arcpy.management.TruncateTable(FC_PATH)
        arcpy.management.Append(query, FC_PATH, "NO_TEST")
    else:
        arcpy.conversion.FeatureClassToFeatureClass(query, FGDB, FC_NAME)
    count = int(arcpy.management.GetCount(FC_PATH)[0])
    if count == 0:
        raise RuntimeError("Evidence snapshot is empty; refusing destructive hosted-layer overwrite.")
    gis = GIS("pro")
    target = gis.content.get(AGOL_ITEM_ID)
    if target is None:
        raise RuntimeError(f"Expected AGOL item {AGOL_ITEM_ID} was not found.")
    aprx = arcpy.mp.ArcGISProject(APRX_PATH)
    maps = aprx.listMaps(MAP_NAME)
    if not maps: raise RuntimeError(f"Publish map {MAP_NAME!r} is missing.")
    publish_map = maps[0]
    for layer in list(publish_map.listLayers()): publish_map.removeLayer(layer)
    layer = publish_map.addDataFromPath(FC_PATH)
    layer.name = LAYER_TITLE
    # Publish a readable parcel polygon rather than the raw Survey123 point.
    # The web layer keeps this renderer and its scale-dependent labels on every
    # daily overwrite.
    symbology = layer.symbology
    symbology.updateRenderer("SimpleRenderer")
    symbology.renderer.symbol.color = {"RGB": [0, 152, 211, 72]}
    symbology.renderer.symbol.outlineColor = {"RGB": [0, 82, 122, 255]}
    symbology.renderer.symbol.outlineWidth = 1.5
    layer.symbology = symbology
    labels = layer.listLabelClasses() or [layer.createLabelClass("Parcel number", "$feature.parcel_number", label_class_expression_engine="Arcade")]
    labels[0].expression = "$feature.parcel_number"
    labels[0].visible = True
    labels[0].minScale = 0
    labels[0].maxScale = 5000
    layer.showLabels = True
    aprx.save()
    draft = publish_map.getWebLayerSharingDraft("HOSTING_SERVER", "FEATURE", LAYER_TITLE)
    draft.overwriteExistingService = True
    draft.portalFolder = PORTAL_FOLDER
    draft.copyDataToServer = True
    draft.summary = "Validated Survey123 photo evidence rendered with authoritative LandCare assignment parcel polygons."
    draft.tags = "URA, LandCare, Survey123, evidence, parcels"
    draft.exportToSDDraft(SDDRAFT)
    arcpy.StageService_server(SDDRAFT, SD_FILE)
    arcpy.UploadServiceDefinition_server(SD_FILE, "My Hosted Services", "OVERRIDE_DEFINITION")
    latest = max((item for item in gis.content.search(f'title:"{LAYER_TITLE}" AND owner:{gis.users.me.username}', max_items=10) if item.type.lower().startswith("feature")), key=lambda item: item.modified, default=None)
    if latest is None or latest.id != AGOL_ITEM_ID:
        raise RuntimeError("Publish drift detected: stable hosted evidence item was not overwritten.")
    item = gis.content.get(AGOL_ITEM_ID)
    try: item.sharing.update({"access": "public"})
    except Exception: item.share(everyone=True, org=False)
    log(f"Published {count:,} canonical evidence polygons to {AGOL_ITEM_ID}.")


if __name__ == "__main__":
    try: main()
    except Exception:
        traceback.print_exc()
        raise
