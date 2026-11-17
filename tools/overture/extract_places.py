"""Extract Overture Maps places inside a box around Ontario to gzip NDJSON.

Reads the places theme of one Overture release from the public S3 bucket
(anonymous, region us-west-2) with DuckDB and httpfs. Only the columns the
importer maps are read, and rows are filtered on the `bbox` struct first so
DuckDB can skip row groups outside the box. The Ontario boundary itself is
applied later by scripts/import-overture-places.ts; the box here includes
parts of Michigan, Ohio, Pennsylvania, New York, Quebec and Manitoba.

Phone numbers, emails and social links are not read. `has_phone` is not
written either: the venue schema has no phone field.

Usage (from the repository root):
    pip install duckdb
    python3 -I tools/overture/extract_places.py 2026-10-21.0 .cache/overture/2026-10-21.0

Writes places-bbox.ndjson.gz and meta.json into the output directory.
"""

import gzip
import json
import os
import sys
from datetime import date

import duckdb

# Box around Ontario taken from the extent of the Land Information Ontario
# "Province" layer (xmin -95.15367, ymin 41.67656, xmax -74.32011, ymax 56.85936),
# rounded outwards.
BOX = {"xmin": -95.16, "xmax": -74.32, "ymin": 41.67, "ymax": 56.86}


def main(release: str, out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)
    con = duckdb.connect()
    con.sql("SET memory_limit='2500MB'; SET threads=2; SET preserve_insertion_order=false;")
    con.sql("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
    url = f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"
    query = f"""
      SELECT id, ST_X(geometry) AS lon, ST_Y(geometry) AS lat, ST_GeometryType(geometry) AS gtype,
             confidence, operating_status, names."primary" AS name, basic_category,
             taxonomy."primary" AS taxonomy_primary, brand.names."primary" AS brand,
             websites, addresses[1] AS address,
             [struct_pack(d := s.dataset, l := s.license, p := s.property, u := s.update_time) FOR s IN sources] AS sources
      FROM read_parquet('{url}', hive_partitioning = 0)
      WHERE bbox.xmin <= {BOX['xmax']} AND bbox.xmax >= {BOX['xmin']}
        AND bbox.ymin <= {BOX['ymax']} AND bbox.ymax >= {BOX['ymin']}
    """
    cursor = con.execute(query)
    out = os.path.join(out_dir, "places-bbox.ndjson.gz")
    rows = 0
    with gzip.open(out, "wt", encoding="utf-8", compresslevel=6) as fh:
        while True:
            batch = cursor.fetchmany(20000)
            if not batch:
                break
            for (pid, lon, lat, gtype, conf, status, name, basic, primary, brand, websites, address, sources) in batch:
                address = address or {}
                fh.write(json.dumps({
                    "id": pid, "lon": lon, "lat": lat, "geometry_type": gtype, "confidence": conf,
                    "operating_status": status, "name": name, "basic_category": basic,
                    "taxonomy_primary": primary, "brand": brand, "websites": websites or [],
                    "address": {k: address.get(k) for k in ("freeform", "locality", "postcode", "region", "country")},
                    "sources": [{"dataset": s["d"], "license": s["l"], "property": s["p"], "update_time": s["u"]} for s in (sources or [])],
                }, ensure_ascii=False, separators=(",", ":")) + "\n")
                rows += 1
    meta = {"release": release, "source": url, "box": BOX, "rows": rows, "retrieved_at": date.today().isoformat()}
    with open(os.path.join(out_dir, "meta.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)
    print(json.dumps(meta))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: extract_places.py <release> <output directory>")
    main(sys.argv[1], sys.argv[2])
