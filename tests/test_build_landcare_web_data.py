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


def test_quarterly_output_reconciles_months_and_keeps_area_baseline_unavailable():
    first = feature("001", "URA")
    first["properties"].update({"parcel_sqft": 1000, "returned_flag": True})
    second = feature("002", "Pittsburgh Land Bank", "50-B-46")
    second["properties"].update({"parcel_sqft": 500, "organization": "Contractor B"})
    third = feature("003", "URA", "50-B-47")
    third["properties"].update({"period_month": "2026-08", "parcel_sqft": 1000})

    quarterly, compliance = MODULE.build_quarterly_outputs([first, second, third])

    quarter = quarterly["quarters"][0]
    assert quarter["quarter"] == "2026-Q3"
    assert quarter["active_assignments"] == 3
    assert quarter["returned_assignments"] == 1
    assert quarter["open_assignments"] == 2
    assert sum(month["active_assignments"] for month in quarter["months"]) == 3
    assert all(row["baseline_sqft"] is None for row in compliance["rows"])
    assert all(row["compliance_status"] == "baseline_unavailable" for row in compliance["rows"])
