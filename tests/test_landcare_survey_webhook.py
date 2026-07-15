import importlib.util
from pathlib import Path
import sys
import types


class _FakeApp:
    def __init__(self, **_kwargs):
        pass

    def get(self, *_args, **_kwargs):
        return lambda function: function

    def post(self, *_args, **_kwargs):
        return lambda function: function

    def add_middleware(self, *_args, **_kwargs):
        return None


class _FakeHttpException(Exception):
    pass


# Unit-test mapping behavior without requiring VM-only web/database packages.
sys.modules.setdefault("psycopg2", types.SimpleNamespace(connect=lambda *_args, **_kwargs: None))
sys.modules.setdefault(
    "fastapi",
    types.SimpleNamespace(
        FastAPI=_FakeApp,
        Header=lambda default=None: default,
        HTTPException=_FakeHttpException,
        Request=object,
    ),
)
sys.modules.setdefault("fastapi.middleware", types.SimpleNamespace())
sys.modules.setdefault("fastapi.middleware.cors", types.SimpleNamespace(CORSMiddleware=object))
sys.modules.setdefault("fastapi.responses", types.SimpleNamespace(JSONResponse=dict))


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "landcare_survey_webhook.py"
SPEC = importlib.util.spec_from_file_location("landcare_survey_webhook", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def test_normalise_submission_maps_regrid_style_answers():
    record = MODULE.normalise_submission(
        {"attributes": {
            "GlobalID": "a1111111-1111-4111-8111-111111111111",
            "OBJECTID": 42,
            "review_status": "approved",
            "parcel_number": "0012-A-00400",
            "maintained_by": "KRJ Enterprises",
            "date_of_services": "2026-07-15",
            "first_visit": "Yes",
            "litter_dumping": "No",
            "pruning_clipping": "Yes",
            "vehicles_lot": "No",
        }},
        "https://example.org/photo.jpg",
    )
    assert record["approval_status"] == "approved"
    assert record["parcel_number"] == "0012-A-00400"
    assert record["first_visit"] is True
    assert record["litter_dumping"] is False
    assert record["image_attachment_url"] == "https://example.org/photo.jpg"


def test_normalise_submission_requires_global_id():
    try:
        MODULE.normalise_submission({"attributes": {"parcel_number": "1"}}, None)
    except ValueError as error:
        assert "GlobalID" in str(error)
    else:
        raise AssertionError("Expected missing GlobalID validation")


if __name__ == "__main__":
    test_normalise_submission_maps_regrid_style_answers()
    test_normalise_submission_requires_global_id()
    print("landcare survey webhook mapping tests passed")
