import importlib.util
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


if __name__ == "__main__":
    test_field_normalization()
    print("survey123 evidence sync mapping tests passed")
