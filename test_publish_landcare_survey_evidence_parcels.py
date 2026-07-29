import datetime as dt
import importlib.util
import sys
import types
from pathlib import Path


sys.modules.setdefault("psycopg2", types.SimpleNamespace(connect=lambda *_args, **_kwargs: None))
PATH = Path(__file__).with_name("publish_landcare_survey_evidence_parcels.py")
SPEC = importlib.util.spec_from_file_location("publish_landcare_survey_evidence_parcels", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def test_polygon_feature_uses_all_multipolygon_rings_and_epoch_dates():
    feature = MODULE.esri_feature({
        "source_global_id": "evidence-1", "assignment_id": 42, "parcel_key": "1",
        "parcel_number": "0001-A", "organization": "Contractor", "service_period": "2026-07",
        "submitted_at": dt.datetime(2026, 7, 15, tzinfo=dt.timezone.utc),
        "evidence_source": "survey123", "image_attachment_url": None,
        "image_attachment_name": None, "validated_at": dt.datetime(2026, 7, 16, tzinfo=dt.timezone.utc),
        "geometry": '{"type":"MultiPolygon","coordinates":[[[[1,2],[2,2],[1,2]]],[[[3,4],[4,4],[3,4]]]]}',
    }, object_id=7)
    assert feature["attributes"]["OBJECTID"] == 7
    assert feature["attributes"]["submitted_at"] == 1784073600000
    assert len(feature["geometry"]["rings"]) == 2


if __name__ == "__main__":
    test_polygon_feature_uses_all_multipolygon_rings_and_epoch_dates()
    print("Survey123 REST publisher mapping tests passed")
