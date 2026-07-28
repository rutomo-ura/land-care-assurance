import importlib.util
import json
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "build_landcare_web_data.py"
SPEC = importlib.util.spec_from_file_location("build_landcare_web_data", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def feature(parcel_key, owner, block_lot="50-B-45"):
    return {
        "type": "Feature",
        "properties": {
            "parcel_key": parcel_key,
            "parcel_number": parcel_key,
            "block_lot": block_lot,
            "period_month": "2026-07",
            "organization": "Contractor A",
            "maintenance_level": "Active",
            "ownership_type": owner,
            "assigned_flag": True,
            "returned_flag": False,
            "completion_status": "missing",
        },
        "geometry": {"type": "Point", "coordinates": [-80, 40]},
    }


def test_build_data_keeps_ura_and_plb_and_excludes_other_owners(tmp_path):
    source = tmp_path / "source.geojson"
    output = tmp_path / "data"
    source.write_text(json.dumps({
        "type": "FeatureCollection",
        "metadata": {},
        "features": [
            feature("001", "URA"),
            feature("002", "Pittsburgh Land Bank", "50-B-46"),
            feature("003", "City of Pittsburgh", "50-B-47"),
        ],
    }), encoding="utf-8")

    MODULE.build_data(source, output)

    collection = json.loads((output / "all_months.geojson").read_text(encoding="utf-8"))
    groups = {row["properties"]["ownership_group"] for row in collection["features"]}
    manifest = json.loads((output / "refresh_manifest.json").read_text(encoding="utf-8"))
    assert groups == {"URA", "PLB"}
    assert len(collection["features"]) == 2
    assert manifest["ownership_counts"] == {"PLB": 1, "URA": 1}
