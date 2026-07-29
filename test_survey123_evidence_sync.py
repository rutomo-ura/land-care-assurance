import importlib.util
import os
import sys
import types
from pathlib import Path


sys.modules.setdefault("psycopg2", types.SimpleNamespace(connect=lambda *_args, **_kwargs: None))
PATH = Path(__file__).with_name("survey123_evidence_sync.py")
SPEC = importlib.util.spec_from_file_location("survey123_evidence_sync", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def test_field_normalization():
    attributes = {
        "GlobalID": "evidence-1", "OBJECTID": 17,
        "parcel_number": "0049-J-00278-0000-00", "organization": "KRJ Enterprises",
        "assignment_period": "2026-07", "untitled_question_2": "55",
    }
    assert MODULE.first(attributes, "globalid") == "evidence-1"
    assert MODULE.first(attributes, "assignment_object_id", "untitled_question_2") == "55"
    assert MODULE.iso_timestamp(0).startswith("1970-01-01T00:00:00")
    assert MODULE.iso_date(1782835200000) == "2026-06-30"


def test_database_dsn_uses_existing_regrid_environment():
    original = {key: os.environ.get(key) for key in ("LANDCARE_PG_DSN", "PG_HOST", "PG_PORT", "PG_DB", "PG_USER", "PG_PWD")}
    try:
        for key in original: os.environ.pop(key, None)
        os.environ.update({"PG_HOST": "localhost", "PG_PORT": "5432", "PG_DB": "gisdb", "PG_USER": "gis_user", "PG_PWD": "safe password"})
        assert MODULE.database_dsn() == "postgresql://gis_user:safe%20password@localhost:5432/gisdb"
    finally:
        for key, value in original.items():
            if value is None: os.environ.pop(key, None)
            else: os.environ[key] = value


if __name__ == "__main__":
    test_field_normalization()
    test_database_dsn_uses_existing_regrid_environment()
    print("survey123 evidence sync mapping tests passed")
