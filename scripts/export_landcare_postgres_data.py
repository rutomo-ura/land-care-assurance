from __future__ import annotations

import argparse
import os
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SQL = ROOT / "prototype" / "sql" / "export_prototype_data_readonly.sql"
DEFAULT_OUTPUT = ROOT / "prototype" / "source" / "app_ready_parcels_monthly.geojson"


def env(name: str, default: str | None = None) -> str | None:
    return os.environ.get(name) or os.environ.get(name.replace("PG_", "POSTGRES_")) or default


def app_ready_sql(path: Path) -> str:
    sql = path.read_text(encoding="utf-8")
    sql = re.sub(r"(?im)^\s*begin\s+read\s+only\s*;\s*$", "", sql)
    sql = re.sub(r"(?im)^\s*rollback\s*;\s*$", "", sql)
    return sql.strip()


def main() -> None:
    parser = argparse.ArgumentParser(description="Export app-ready LandCare GeoJSON from PostgreSQL.")
    parser.add_argument("--sql", type=Path, default=DEFAULT_SQL)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--host", default=env("PG_HOST", "10.0.101.57"))
    parser.add_argument("--port", default=env("PG_PORT", "5432"))
    parser.add_argument("--dbname", default=env("PG_DB", env("PGDATABASE", "gisdb")))
    parser.add_argument("--user", default=env("PG_USER", env("PGUSER", "rutomo")))
    parser.add_argument("--password", default=env("PG_PASSWORD", env("PGPASSWORD")))
    args = parser.parse_args()

    try:
        import psycopg2
    except ImportError as exc:
        raise SystemExit(
            "Missing psycopg2. Install dependencies with: python -m pip install -r requirements-landcare-refresh.txt"
        ) from exc

    if not args.password:
        raise SystemExit("Set PG_PASSWORD or PGPASSWORD before running the export.")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    conn = psycopg2.connect(
        host=args.host,
        port=args.port,
        dbname=args.dbname,
        user=args.user,
        password=args.password,
    )
    try:
        with conn.cursor() as cur:
            cur.execute("begin read only;")
            cur.execute(app_ready_sql(args.sql))
            payload = cur.fetchone()[0]
            cur.execute("rollback;")
        args.output.write_text(payload, encoding="utf-8", newline="\n")
    finally:
        conn.close()

    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
