"""OpenSanctions Singapore datasets (bulk download, same endpoint family as opensanctions.py):

- sg_terrorists: targets.simple.csv (Singapore MAS targeted financial sanctions list).
- sg_mas_enforcement_actions: its targets.simple.csv is empty by design (the entities are
  mentioned in enforcement actions, not sanctioned), so we read entities.ftm.json (JSON lines,
  ~0.7 MB) and keep the Person/Company entities. The Sanction/Documentation/Article records
  are link objects, not entities, and are skipped.
"""
import json

import requests

from collector.common import TIMEOUT, USER_AGENT, parse_date
from collector.opensanctions import ENTITY_URL, row_to_item, stream_rows

SOURCE_TERRORISTS = "opensanctions_sg_terrorists"
SOURCE_ENFORCEMENT = "opensanctions_sg_mas_enforcement"
FTM_URL = "https://data.opensanctions.org/datasets/latest/sg_mas_enforcement_actions/entities.ftm.json"
ENTITY_SCHEMAS = {"Person", "Company", "Organization", "LegalEntity"}


def fetch_terrorists():
    for row in stream_rows("sg_terrorists"):
        if row["name"].strip():
            yield row_to_item(row, SOURCE_TERRORISTS, regulator="MAS", jurisdiction="SG")


def fetch_mas_enforcement():
    with requests.get(FTM_URL, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT, stream=True) as resp:
        resp.raise_for_status()
        resp.encoding = "utf-8"
        seen = 0
        for line in resp.iter_lines(decode_unicode=True):
            if not line:
                continue
            ent = json.loads(line)
            if ent.get("schema") not in ENTITY_SCHEMAS:
                continue
            seen += 1
            props = ent.get("properties", {})
            names = list(dict.fromkeys([ent["caption"]] + props.get("name", []) + props.get("alias", [])))
            source_urls = props.get("sourceUrl", [])
            yield {
                "source": SOURCE_ENFORCEMENT,
                "source_type": "sanctions_list",
                "regulator": "MAS",
                "jurisdiction": "SG",
                "category": "enforcement_action",
                "title": ent["caption"],
                "summary": None,
                "url": source_urls[0] if source_urls else ENTITY_URL.format(id=ent["id"]),
                "natural_key": ent["id"],
                "published_at": parse_date(ent.get("first_seen")),
                "raw_payload": ent,
                "entity_names": names,
            }
        if seen == 0:
            raise ValueError("sg_mas_enforcement_actions: no Person/Company entities found (format changed?)")
