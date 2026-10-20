"""OpenSanctions consolidated sanctions dataset, via the documented bulk download
(https://data.opensanctions.org/datasets/latest/<dataset>/targets.simple.csv, which redirects
to a dated artifact). ~78 MB / ~74k rows, so it is streamed and fetch() returns a generator.
"""
import csv
import re

import requests

from collector.common import TIMEOUT, USER_AGENT, parse_date

SOURCE = "opensanctions_consolidated"
DATASET = "sanctions"
BULK_URL = "https://data.opensanctions.org/datasets/latest/{dataset}/targets.simple.csv"
ENTITY_URL = "https://www.opensanctions.org/entities/{id}/"
EXPECTED_COLUMNS = {"id", "schema", "name", "aliases", "countries", "sanctions", "program_ids",
                    "dataset", "first_seen", "last_seen", "last_change"}

# Issuing list (matched against the record's `dataset` field, first match wins) -> (regulator, jurisdiction)
ISSUERS = [
    (r"OFAC", ("OFAC", "US")),
    (r"UN Security Council", ("UN", "GLOBAL")),
    (r"\bEU\b", ("EU", "EU")),
    (r"\bUK\b|OFSI", ("UK-OFSI", "GB")),
    (r"Singapore", ("MAS", "SG")),
]
PREFIX_JURISDICTION = {"SECO": "CH", "UK": "GB"}


def issuer(dataset_field, program_ids):
    """Regulator/jurisdiction from the record's issuing list(s); jurisdiction falls back to the
    program-id prefix (e.g. CA-..., AU-...), then GLOBAL. Regulator stays None when unknown."""
    for pattern, result in ISSUERS:
        if re.search(pattern, dataset_field):
            return result
    prefix = (program_ids.split(";")[0].split("-")[0]) if program_ids else ""
    if prefix:
        return None, PREFIX_JURISDICTION.get(prefix, prefix)
    return None, "GLOBAL"


def stream_rows(dataset):
    """Yield csv rows (dicts) from a dataset's targets.simple.csv without loading it in memory."""
    with requests.get(BULK_URL.format(dataset=dataset), headers={"User-Agent": USER_AGENT},
                      timeout=TIMEOUT, stream=True) as resp:
        resp.raise_for_status()
        resp.encoding = "utf-8"
        reader = csv.DictReader(resp.iter_lines(decode_unicode=True))
        missing = EXPECTED_COLUMNS - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"OpenSanctions {dataset} CSV missing columns {sorted(missing)} (format changed?)")
        yield from reader


def row_to_item(row, source, regulator=None, jurisdiction=None, derive_issuer=False):
    name = row["name"].strip()
    names = [name] + [a.strip() for a in row["aliases"].split(";") if a.strip()]
    entity_names = list(dict.fromkeys(n for n in names if n))
    if derive_issuer:
        regulator, jurisdiction = issuer(row["dataset"], row["program_ids"])
    return {
        "source": source,
        "source_type": "sanctions_list",
        "regulator": regulator,
        "jurisdiction": jurisdiction,
        "category": "sanctions_designation",
        "title": name,
        "summary": f"Listed by: {row['dataset']}" if row["dataset"] else None,
        "url": ENTITY_URL.format(id=row["id"]),
        "natural_key": row["id"],  # OpenSanctions' own stable entity id
        "published_at": parse_date(row["first_seen"]) or None,
        "raw_payload": dict(row),
        "entity_names": entity_names,
    }


def fetch():
    for row in stream_rows(DATASET):
        if row["name"].strip():
            yield row_to_item(row, SOURCE, derive_issuer=True)
